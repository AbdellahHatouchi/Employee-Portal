import { createMiddleware } from "hono/factory";
import { bodyDigest, verifySignature } from "./signature";
export type SyncEnv = { Variables: { syncBody: string } };
export function createMachineAuthorization(
	database: () => D1Database,
	secret: () => string | undefined,
) {
	return createMiddleware<SyncEnv>(async (c, next) => {
		const key = secret();
		if (!key || key.length < 32)
			return c.json({ error: "sync-not-configured" }, 503);
		const timestamp = c.req.header("X-Sync-Timestamp") ?? "";
		const nonce = c.req.header("X-Sync-Nonce") ?? "";
		const signature = c.req.header("X-Sync-Signature") ?? "";
		if (
			!/^\d{13}$/.test(timestamp) ||
			Math.abs(Date.now() - Number(timestamp)) > 300000 ||
			!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
				nonce,
			)
		)
			return c.json({ error: "invalid-timestamp-or-nonce" }, 401);
		const body = await c.req.text();
		const message = [
			"v1",
			c.req.method,
			new URL(c.req.url).pathname,
			timestamp,
			nonce,
			await bodyDigest(body),
		].join("\n");
		if (!(await verifySignature(key, signature, message)))
			return c.json({ error: "invalid-signature" }, 401);
		const db = database();
		await db
			.prepare("DELETE FROM sync_nonces WHERE expires_at<?")
			.bind(Date.now())
			.run();
		const inserted = await db
			.prepare(
				"INSERT INTO sync_nonces(nonce,expires_at) VALUES(?,?) ON CONFLICT(nonce) DO NOTHING RETURNING nonce",
			)
			.bind(nonce, Date.now() + 600000)
			.all();
		if (!inserted.results.length)
			return c.json({ error: "replayed-nonce" }, 409);
		c.set("syncBody", body);
		await next();
	});
}
