import type { z } from "zod";
import type { lookupInput, operation, reconciliationPage } from "./contracts";
import {
	all,
	first,
	highWaterSql,
	notOperated,
	operate,
	requestJson,
} from "./database";
export async function startReconciliation(
	db: D1Database,
	input: z.infer<typeof operation>,
) {
	const sessionId = crypto.randomUUID();
	const now = Date.now();
	const expiresAt = now + 1800000;
	return operate(
		db,
		input,
		"reconciliation",
		input,
		[
			{
				sql: `INSERT INTO reconciliation_sessions(id,machine_id,created_at,expires_at,high_water) SELECT ?,?,?,?,${highWaterSql} WHERE ${notOperated}`,
				values: [sessionId, input.machineId, now, expiresAt, input.operationId],
			},
			{
				sql: `INSERT INTO reconciliation_records(session_id,key,payload) SELECT ?, 'employee:'||e.local_employee_id,json_object('kind','employee','id',e.local_employee_id,'version',e.version,'name',u.name,'email',u.email,'enabled',json(CASE WHEN e.enabled THEN 'true' ELSE 'false' END),'emailRevision',e.email_revision,'activated',json(CASE WHEN e.activated_revision=e.email_revision THEN 'true' ELSE 'false' END)) FROM employee_accounts e JOIN user u ON u.id=e.user_id WHERE EXISTS(SELECT 1 FROM reconciliation_sessions WHERE id=?)`,
				values: [sessionId, sessionId],
			},
			{
				sql: `INSERT INTO reconciliation_records(session_id,key,payload) SELECT ?, 'request:'||r.id,json_set(${requestJson},'$.kind','request','$.localEmployeeId',e.local_employee_id,'$.note',r.note,'$.createdAt',r.created_at,'$.claim',json((SELECT json_object('id',c.id,'machineId',c.machine_id,'operationId',c.operation_id,'expiresAt',c.expires_at,'committedAt',c.committed_at) FROM request_claims c WHERE c.id=r.claim_id)),'$.items',json((SELECT coalesce(json_group_array(json_object('productId',i.product_id,'quantity',i.quantity,'label',i.label,'unit',i.unit)),json('[]')) FROM cloud_request_items i WHERE i.request_id=r.id))) FROM cloud_requests r LEFT JOIN employee_accounts e ON e.user_id=r.employee_id WHERE EXISTS(SELECT 1 FROM reconciliation_sessions WHERE id=?)`,
				values: [sessionId, sessionId],
			},
			{
				sql: `INSERT INTO reconciliation_records(session_id,key,payload) SELECT ?,'catalogue',json_object('kind','catalogue','version',coalesce((SELECT version FROM sync_state WHERE key='catalog'),0)) WHERE EXISTS(SELECT 1 FROM reconciliation_sessions WHERE id=?)`,
				values: [sessionId, sessionId],
			},
		],
		{
			sql: "SELECT json_object('result','snapshot','sessionId',?,'expiresAt',?,'highWater',(SELECT high_water FROM reconciliation_sessions WHERE id=?),'recordCount',(SELECT count(*) FROM reconciliation_records WHERE session_id=?))",
			values: [sessionId, expiresAt, sessionId, sessionId],
		},
	);
}
async function activeSession(
	db: D1Database,
	machineId: string,
	sessionId: string,
) {
	return first<{ high_water: number; created_at: number; expires_at: number }>(
		db,
		"SELECT * FROM reconciliation_sessions WHERE id=? AND machine_id=? AND expires_at>?",
		sessionId,
		machineId,
		Date.now(),
	);
}
export async function pageReconciliation(
	db: D1Database,
	input: z.infer<typeof reconciliationPage>,
) {
	const session = await activeSession(db, input.machineId, input.sessionId);
	if (!session) return { error: "session-expired-or-unknown" };
	const rows = await all<{ key: string; payload: string }>(
		db,
		"SELECT key,payload FROM reconciliation_records WHERE session_id=? AND key>? ORDER BY key LIMIT ?",
		input.sessionId,
		input.after ?? "",
		input.limit + 1,
	);
	const hasMore = rows.length > input.limit;
	const records = rows.slice(0, input.limit);
	return {
		sessionId: input.sessionId,
		highWater: session.high_water,
		snapshotAt: session.created_at,
		records: records.map((r) => JSON.parse(r.payload)),
		nextCursor: hasMore ? records.at(-1)?.key : null,
		complete: !hasMore,
	};
}
export async function lookupReconciliation(
	db: D1Database,
	input: z.infer<typeof lookupInput>,
) {
	const session = await activeSession(db, input.machineId, input.sessionId);
	if (!session) return { error: "session-expired-or-unknown" };
	const keys = [
		...input.employeeIds.map((id) => `employee:${id}`),
		...input.requestIds.map((id) => `request:${id}`),
		...(input.catalogue ? ["catalogue"] : []),
	];
	const rows = keys.length
		? await all<{ key: string; payload: string }>(
				db,
				"SELECT key,payload FROM reconciliation_records WHERE session_id=? AND key IN (" +
					keys.map(() => "?").join(",") +
					")",
				input.sessionId,
				...keys,
			)
		: [];
	const found = new Map(rows.map((r) => [r.key, JSON.parse(r.payload)]));
	return {
		sessionId: input.sessionId,
		highWater: session.high_water,
		snapshotAt: session.created_at,
		records: keys.map((key) => found.get(key) ?? { kind: "missing", key }),
		complete: true,
	};
}
