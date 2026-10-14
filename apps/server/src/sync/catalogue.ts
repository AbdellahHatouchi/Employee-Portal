import { syncState } from "@store-managment-communal-web/db/schema/portal";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../services";
import type { SyncEnv } from "./authorization";
import { catalogueInput } from "./contracts";
import { catalogueFingerprint } from "./v2/catalogue";

export const catalogueSync = new Hono<SyncEnv>().post("/", async (c) => {
	const parsed = catalogueInput.safeParse(JSON.parse(c.get("syncBody")));
	if (!parsed.success)
		return c.json({ error: "Invalid catalogue snapshot" }, 400);
	const { products, version } = parsed.data;
	const db = getDb();
	const now = Date.now();
	// Version checks execute inside one D1 batch, not against a stale pre-read.
	await db.batch([
		db
			.insert(syncState)
			.values({ key: "catalog", version: 0, updatedAt: 0 })
			.onConflictDoNothing(),
		db.run(
			sql`UPDATE catalog_products SET available = 0 WHERE ${version} > (SELECT version FROM sync_state WHERE key = 'catalog')`,
		),
		...products.map((p) =>
			db.run(
				sql`INSERT INTO catalog_products (id, label, unit, available, version, published_at) SELECT ${p.id}, ${p.label}, ${p.unit}, ${p.available ? 1 : 0}, ${version}, ${now} WHERE ${version} > (SELECT version FROM sync_state WHERE key = 'catalog') ON CONFLICT(id) DO UPDATE SET label = excluded.label, unit = excluded.unit, available = excluded.available, version = excluded.version, published_at = excluded.published_at`,
			),
		),
		db.run(
			sql`UPDATE sync_state SET version = ${version}, updated_at = ${now}, fingerprint = ${catalogueFingerprint(products)} WHERE key = 'catalog' AND version < ${version}`,
		),
	]);
	const [state] = await db
		.select()
		.from(syncState)
		.where(eq(syncState.key, "catalog"))
		.limit(1);
	return c.json({ schemaVersion: 1, version: state?.version });
});
