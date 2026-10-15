import { expect, test } from "bun:test";
import {
	type PasswordEmailReceipt,
	sendPasswordEmail,
} from "@store-managment-communal-web/auth/email";
import { requirePasswordEmailAcceptance } from "@store-managment-communal-web/auth/invitation";

const config = {
	RESEND_API_KEY: "synthetic-unit-key",
	RESEND_FROM: "test@example.test",
};
const resetUrl = "https://example.test/reset/not-a-real-token";
function sender(response: () => Promise<Response>) {
	return response;
}

test("missing provider cannot produce accepted receipt or a successful V2 sender", async () => {
	const receipt: PasswordEmailReceipt = { accepted: false };
	await expect(
		sendPasswordEmail({}, "test@example.test", resetUrl, "attempt", receipt),
	).rejects.toThrow("not configured");
	expect(receipt.accepted).toBe(false);
	await expect(
		requirePasswordEmailAcceptance(async (observed) => {
			// Reproduce Better Auth's documented generic success after swallowing callback errors.
			try {
				await sendPasswordEmail(
					{},
					"test@example.test",
					resetUrl,
					"attempt",
					observed,
				);
			} catch {}
			return { status: true };
		}),
	).rejects.toThrow("acceptance was not confirmed");
});
test("provider rejection, malformed success and uncertain network outcomes cannot report sent", async () => {
	for (const transport of [
		sender(async () => new Response("rejected", { status: 403 })),
		sender(async () => Response.json({})),
		sender(async () => {
			throw new Error("synthetic uncertain delivery");
		}),
	]) {
		await expect(
			requirePasswordEmailAcceptance(async (receipt) => {
				try {
					await sendPasswordEmail(
						config,
						"test@example.test",
						resetUrl,
						"attempt",
						receipt,
						transport,
					);
				} catch {}
				return { status: true };
			}),
		).rejects.toThrow("acceptance was not confirmed");
	}
});
test("only provider acceptance with message identity permits V2 success, keeping idempotency", async () => {
	const keys: string[] = [];
	await requirePasswordEmailAcceptance(async (receipt) => {
		await sendPasswordEmail(
			config,
			"test@example.test",
			resetUrl,
			"stable-attempt",
			receipt,
			async (_input, init) => {
				keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
				return Response.json({ id: "synthetic-provider-message" });
			},
		);
	});
	expect(keys[0]).toBe("stable-attempt");
});
test("generic reset success without callback and callback failure are not provider evidence", async () => {
	await expect(
		requirePasswordEmailAcceptance(async () => ({ status: true })),
	).rejects.toThrow("acceptance was not confirmed");
	await expect(
		requirePasswordEmailAcceptance(async () => {
			throw new Error("synthetic failure");
		}),
	).rejects.toThrow("synthetic failure");
});

test("invitation sends bilingual HTML and plain text with the exact original link", async () => {
	const url =
		"https://example.test/reset/preview-only?callbackURL=https%3A%2F%2Fexample.test%2Factivate&source=preview";
	const receipt: PasswordEmailReceipt = { accepted: false };
	let message: { html: string; text: string } | undefined;
	await sendPasswordEmail(
		config,
		"test@example.test",
		url,
		"stable-design-attempt",
		receipt,
		async (_input, init) => {
			message = JSON.parse(String(init?.body));
			return Response.json({ id: "synthetic-provider-message" });
		},
	);
	expect(receipt.accepted).toBe(true);
	expect(message?.html).toContain("<!DOCTYPE html");
	expect(message?.html).toContain("Choisir mon mot de passe");
	expect(message?.html).toContain("تعيين كلمة المرور");
	expect(message?.html).toContain('dir="rtl"');
	expect(message?.html).toContain(url.replaceAll("&", "&amp;"));
	expect(message?.text).toContain(url);
	expect(message?.html).toContain("30 minutes");
	expect(message?.text).toContain("30 minutes");
	expect(message?.html).not.toMatch(/<script|<img/i);
});
