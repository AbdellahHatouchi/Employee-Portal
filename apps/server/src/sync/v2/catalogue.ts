import type { z } from "zod";
import type { catalogueInput, product } from "./contracts";
import { canonical, notOperated, operate, type Query } from "./database";
export function catalogueFingerprint(products: z.infer<typeof product>[]) {
	return canonical([...products].sort((a, b) => a.id.localeCompare(b.id)));
}
export function catalogueChanges(
	input: z.infer<typeof catalogueInput>,
	additionalGuard = "1=1",
): Query[] {
	const now = Date.now();
	const guard = `?>(SELECT version FROM sync_state WHERE key='catalog') AND ${notOperated} AND ${additionalGuard}`;
	return [
		{
			sql: "INSERT INTO sync_state(key,version,updated_at) VALUES('catalog',0,0) ON CONFLICT(key) DO NOTHING",
		},
		{
			sql: `UPDATE catalog_products SET available=0 WHERE ${guard}`,
			values: [input.version, input.operationId],
		},
		...input.products.map((p) => ({
			sql: `INSERT INTO catalog_products(id,label,unit,available,version,published_at) SELECT ?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET label=excluded.label,unit=excluded.unit,available=excluded.available,version=excluded.version,published_at=excluded.published_at`,
			values: [
				p.id,
				p.label,
				p.unit,
				p.available,
				input.version,
				now,
				input.version,
				input.operationId,
			],
		})),
		{
			sql: `UPDATE sync_state SET version=?,updated_at=?,fingerprint=? WHERE key='catalog' AND ${guard}`,
			values: [
				input.version,
				now,
				catalogueFingerprint(input.products),
				input.version,
				input.operationId,
			],
		},
	];
}
export function catalogueOutcome(input: z.infer<typeof catalogueInput>): Query {
	return {
		sql: `SELECT json_object('result',CASE WHEN (SELECT version FROM sync_state WHERE key='catalog')>? THEN 'stale' WHEN (SELECT version FROM sync_state WHERE key='catalog')=? AND (SELECT fingerprint FROM sync_state WHERE key='catalog')=? THEN CASE WHEN changes()>0 THEN 'acknowledged' ELSE 'equivalent' END ELSE 'version-conflict' END,'attemptedVersion',?,'remoteVersion',(SELECT version FROM sync_state WHERE key='catalog'))`,
		values: [
			input.version,
			input.version,
			catalogueFingerprint(input.products),
			input.version,
		],
	};
}
export async function publishCatalogue(
	db: D1Database,
	input: z.infer<typeof catalogueInput>,
) {
	return operate(
		db,
		input,
		"catalogue",
		input,
		catalogueChanges(input),
		catalogueOutcome(input),
	);
}
