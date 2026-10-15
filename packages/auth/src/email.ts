import { renderPasswordEmail } from "./email-template";

export type PasswordEmailReceipt = { accepted: boolean };

export type EmailConfig = { RESEND_API_KEY?: string; RESEND_FROM?: string };

export async function sendPasswordEmail(
	env: EmailConfig,
	to: string,
	url: string,
	idempotencyKey?: string,
	receipt?: PasswordEmailReceipt,
	transport: (input: string, init: RequestInit) => Promise<Response> = fetch,
) {
	if (!env.RESEND_API_KEY || !env.RESEND_FROM)
		throw new Error("Transactional email is not configured");
	const content = await renderPasswordEmail(url);
	const response = await transport("https://api.resend.com/emails", {
		signal: AbortSignal.timeout(10000),
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
		},
		body: JSON.stringify({
			from: env.RESEND_FROM,
			to: [to],
			subject: "Portail communal — accès au compte / تفعيل الحساب",
			...content,
		}),
	});
	if (!response.ok) throw new Error("Email provider rejected the request");
	const result: unknown = await response.json();
	if (
		!result ||
		typeof result !== "object" ||
		!("id" in result) ||
		typeof result.id !== "string" ||
		!result.id.trim()
	)
		throw new Error("Email provider acceptance was not confirmed");
	// Provider acceptance is not proof of mailbox delivery.
	if (receipt) receipt.accepted = true;
}
