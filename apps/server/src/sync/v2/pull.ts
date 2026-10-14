import type { z } from "zod";
import type { pullInput } from "./contracts";
import { all, requestJson } from "./database";
export async function pullRequests(
	db: D1Database,
	input: z.infer<typeof pullInput>,
) {
	const rows = await all<{ id: string; payload: string }>(
		db,
		`SELECT r.id,json_set(${requestJson},'$.localEmployeeId',e.local_employee_id,'$.employeeId',r.employee_id,'$.note',r.note,'$.createdAt',r.created_at,'$.updatedAt',r.updated_at,'$.claim',json((SELECT json_object('id',c.id,'machineId',c.machine_id,'operationId',c.operation_id,'expiresAt',c.expires_at,'committedAt',c.committed_at) FROM request_claims c WHERE c.id=r.claim_id)),'$.items',json((SELECT coalesce(json_group_array(json_object('requestId',i.request_id,'productId',i.product_id,'quantity',i.quantity,'label',i.label,'unit',i.unit)),json('[]')) FROM cloud_request_items i WHERE i.request_id=r.id))) payload FROM cloud_requests r LEFT JOIN employee_accounts e ON e.user_id=r.employee_id WHERE r.status='submitted' AND r.imported_at IS NULL AND r.id>? ORDER BY r.id LIMIT ?`,
		input.after ?? "",
		input.limit + 1,
	);
	const visible = rows.slice(0, input.limit);
	return {
		requests: visible.map((r) => JSON.parse(r.payload)),
		nextCursor: rows.length > input.limit ? visible.at(-1)?.id : null,
	};
}
