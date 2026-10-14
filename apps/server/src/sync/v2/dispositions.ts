import type { z } from "zod";
import type { dispositionsInput } from "./contracts";
import { notOperated, operate, requestOutcome } from "./database";

type RecordInput = z.infer<typeof dispositionsInput>["records"][number];
export async function disposeRequest(
	db: D1Database,
	machineId: string,
	input: RecordInput,
) {
	return {
		id: input.id,
		...(await operate(
			db,
			{ ...input, machineId },
			"disposition",
			input,
			[
				{
					sql: `UPDATE cloud_requests SET status='refused',disposition_reason=?,can_cancel=0,state_version=state_version+1,updated_at=? WHERE id=? AND imported_at IS NULL AND status='submitted' AND state_version=? AND (claim_id IS NULL OR EXISTS(SELECT 1 FROM request_claims WHERE id=claim_id AND machine_id=?)) AND ${notOperated}`,
					values: [
						input.reason,
						Date.now(),
						input.id,
						input.expectedStateVersion,
						machineId,
						input.operationId,
					],
				},
			],
			{
				sql: requestOutcome(
					`CASE WHEN changes()>0 THEN 'acknowledged' WHEN NOT EXISTS(SELECT 1 FROM cloud_requests WHERE id=?) THEN 'unknown-id' WHEN EXISTS(SELECT 1 FROM cloud_requests WHERE id=? AND imported_at IS NULL AND status='refused' AND disposition_reason=?) THEN 'equivalent' ELSE 'state-conflict' END`,
				),
				values: [input.id, input.id, input.reason, input.id],
			},
		)),
	};
}
