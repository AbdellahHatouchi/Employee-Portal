export type Query = { sql: string; values?: unknown[] };
export function statement(db: D1Database, query: Query) {
	return db.prepare(query.sql).bind(...(query.values ?? []));
}
export async function first<T>(
	db: D1Database,
	sql: string,
	...values: unknown[]
) {
	return db
		.prepare(sql)
		.bind(...values)
		.first<T>();
}
export async function all<T>(
	db: D1Database,
	sql: string,
	...values: unknown[]
) {
	return (
		await db
			.prepare(sql)
			.bind(...values)
			.all<T>()
	).results;
}
export function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object")
		return (
			"{" +
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
				.join(",") +
			"}"
		);
	return JSON.stringify(value);
}
export async function digest(value: string) {
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(bytes), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}
export const notOperated =
	"NOT EXISTS (SELECT 1 FROM exchange_operations WHERE id = ?)";
export async function operate(
	db: D1Database,
	input: { operationId: string; machineId: string },
	kind: string,
	payload: unknown,
	changes: Query[],
	outcome: Query,
) {
	const fingerprint = canonical(payload);
	const existing = await first<{
		machine_id: string;
		kind: string;
		fingerprint: string;
		result: string;
	}>(db, "SELECT * FROM exchange_operations WHERE id = ?", input.operationId);
	if (existing)
		return decode(existing, input.machineId, kind, fingerprint, true);
	const written = await db.batch([
		...changes.map((q) => statement(db, q)),
		statement(db, {
			sql:
				"INSERT INTO exchange_operations (id,machine_id,kind,fingerprint,result,created_at) SELECT ?,?,?,?,(" +
				outcome.sql +
				"),? ON CONFLICT(id) DO NOTHING",
			values: [
				input.operationId,
				input.machineId,
				kind,
				fingerprint,
				...(outcome.values ?? []),
				Date.now(),
			],
		}),
	]);
	const result = await first<{
		machine_id: string;
		kind: string;
		fingerprint: string;
		result: string;
	}>(db, "SELECT * FROM exchange_operations WHERE id = ?", input.operationId);
	if (!result) throw new Error("Operation receipt missing");
	return decode(
		result,
		input.machineId,
		kind,
		fingerprint,
		written.at(-1)?.meta.changes === 0,
	);
}
function decode(
	row: {
		machine_id: string;
		kind: string;
		fingerprint: string;
		result: string;
	},
	machineId: string,
	kind: string,
	fingerprint: string,
	replayed: boolean,
): { result: string; replayed: boolean; [key: string]: unknown } {
	if (
		row.machine_id !== machineId ||
		row.kind !== kind ||
		row.fingerprint !== fingerprint
	)
		return { result: "operation-conflict", replayed };
	return { ...JSON.parse(row.result), replayed };
}
export const highWaterSql =
	"(SELECT max(v) FROM (SELECT coalesce(max(version),0) v FROM employee_accounts UNION ALL SELECT coalesce(max(publication_version),0) FROM cloud_requests UNION ALL SELECT coalesce(max(version),0) FROM sync_state UNION ALL SELECT coalesce(max(version),0) FROM catalogue_stages))";
export const requestJson = `json_object('id',r.id,'stateVersion',r.state_version,'remoteVersion',r.publication_version,'status',r.status,'localReference',r.local_reference,'canCancel',json(CASE WHEN r.status = 'submitted' AND r.imported_at IS NULL AND r.can_cancel = 1 THEN 'true' ELSE 'false' END),'cancelRequestedAt',r.cancel_requested_at,'importedAt',r.imported_at,'claimId',r.claim_id,'dispositionReason',r.disposition_reason)`;
export const requestOutcome = (result: string) =>
	`SELECT json_object('result',${result},'remote',json((SELECT ${requestJson} FROM cloud_requests r WHERE r.id = ?)))`;
