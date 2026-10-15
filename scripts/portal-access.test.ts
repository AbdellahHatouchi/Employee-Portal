import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkPortalAccess } from "../apps/web/src/lib/portal-access";
import type { Context } from "../packages/api/src/context";
import { appRouter } from "../packages/api/src/routers";

const origin = "https://api.example.test";
describe("server portal authorization", () => {
	test("no cookie does not render private content or contact the API", async () => {
		expect(
			await checkPortalAccess(origin, "", (() => {
				throw new Error("unexpected network");
			}) as typeof fetch),
		).toBe(false);
	});
	test("expired, forged or forbidden sessions are refused", async () => {
		for (const status of [401, 403]) {
			expect(
				await checkPortalAccess(
					origin,
					"synthetic-session",
					(async () => new Response(null, { status })) as typeof fetch,
				),
			).toBe(false);
		}
	});
	test("API errors and malformed success responses fail closed", async () => {
		for (const response of [
			new Response(null, { status: 500 }),
			new Response(null, {
				status: 302,
				headers: { Location: "https://untrusted.example.test" },
			}),
			new Response(null, { status: 307, headers: { Location: "/login" } }),
			Response.json({}),
			Response.json({ result: { data: { user: { id: "" } } } }),
		]) {
			await expect(
				checkPortalAccess(
					origin,
					"synthetic-session",
					(async () => response) as typeof fetch,
				),
			).rejects.toThrow();
		}
	});
	test("valid account verification forwards cookies without shared caching", async () => {
		let called = false;
		expect(
			await checkPortalAccess(origin, "synthetic-session", (async (
				url,
				init,
			) => {
				called = true;
				expect(String(url)).toBe(`${origin}/trpc/privateData`);
				expect(init?.cache).toBe("no-store");
				expect(init?.redirect).toBe("manual");
				expect(new Headers(init?.headers).get("Cookie")).toBe(
					"synthetic-session",
				);
				return Response.json({
					result: { data: { user: { id: "synthetic-user" } } },
				});
			}) as typeof fetch),
		).toBe(true);
		expect(called).toBe(true);
	});
	test("all private entry pages await the server guard", () => {
		for (const path of [
			"page.tsx",
			"dashboard/page.tsx",
			"profile/page.tsx",
			"requests/page.tsx",
			"requests/new/page.tsx",
			"requests/[id]/page.tsx",
		]) {
			const source = readFileSync(
				resolve(import.meta.dir, "../apps/web/src/app", path),
				"utf8",
			);
			expect(source).toContain("await requirePortalAccess()");
		}
	});
	test("API refuses anonymous callers", async () => {
		const caller = appRouter.createCaller({ session: null, db: {} } as Context);
		await expect(caller.privateData()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
	test("API checks current enabled and activated employee state", async () => {
		for (const employee of [
			undefined,
			{ enabled: false, emailRevision: 1, activatedRevision: 1 },
			{ enabled: true, emailRevision: 2, activatedRevision: 1 },
			{ enabled: true, emailRevision: 2, activatedRevision: 2 },
		]) {
			const db = {
				select: () => ({
					from: () => ({
						where: () => ({ limit: async () => (employee ? [employee] : []) }),
					}),
				}),
			};
			const caller = appRouter.createCaller({
				session: { user: { id: "synthetic-user" } },
				db,
			} as unknown as Context);
			if (
				employee?.enabled &&
				employee.emailRevision === employee.activatedRevision
			) {
				expect((await caller.privateData()).user.id).toBe("synthetic-user");
			} else
				await expect(caller.privateData()).rejects.toMatchObject({
					code: "FORBIDDEN",
				});
		}
	});
});
