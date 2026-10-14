import type { z } from "zod";
import type { statusRecord } from "./contracts";
import { first, notOperated, operate, requestOutcome } from "./database";
export async function publishStatus(
	db: D1Database,
	machineId: string,
	input: z.infer<typeof statusRecord>,
) {
	const fingerprint = JSON.stringify({
		localReference: input.localReference,
		status: input.status,
		canCancel: false,
		cancellationResolved: input.cancellationResolved,
	});
	const now = Date.now();
	const updated = await operate(
		db,
		{ ...input, machineId },
		"status",
		input,
		[
			{
				sql: `UPDATE cloud_requests SET status=?,local_reference=?,publication_version=?,publication_fingerprint=?,state_version=state_version+1,can_cancel=0,cancel_requested_at=CASE WHEN ? THEN NULL ELSE cancel_requested_at END,updated_at=? WHERE id=? AND imported_at IS NOT NULL AND publication_version < ? AND local_reference=? AND (status=? OR (status='pending' AND ? IN ('accepted','refused','cancelled')) OR (status='accepted' AND ? IN ('delivered','cancelled'))) AND ${notOperated}`,
				values: [
					input.status,
					input.localReference,
					input.version,
					fingerprint,
					input.cancellationResolved,
					now,
					input.id,
					input.version,
					input.localReference,
					input.status,
					input.status,
					input.status,
					input.operationId,
				],
			},
		],
		{
			sql: requestOutcome(
				`CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_requests WHERE id=?) THEN 'unknown-id' WHEN (SELECT imported_at FROM cloud_requests WHERE id=?) IS NULL THEN 'import-required' WHEN (SELECT publication_version FROM cloud_requests WHERE id=?) > ? THEN 'stale' WHEN (SELECT publication_version FROM cloud_requests WHERE id=?) = ? AND (SELECT publication_fingerprint FROM cloud_requests WHERE id=?) = ? THEN CASE WHEN changes()>0 THEN 'acknowledged' ELSE 'equivalent' END WHEN (SELECT publication_version FROM cloud_requests WHERE id=?) = ? THEN 'version-conflict' ELSE 'state-conflict' END`,
			),
			values: [
				input.id,
				input.id,
				input.id,
				input.version,
				input.id,
				input.version,
				input.id,
				fingerprint,
				input.id,
				input.version,
				input.id,
			],
		},
	);
	return { id: input.id, attemptedVersion: input.version, ...updated };
}
export async function legacyStatusFence(db: D1Database, id: string) {
	return first<{ claim_id: string | null }>(
		db,
		"SELECT claim_id FROM cloud_requests WHERE id=?",
		id,
	);
}
