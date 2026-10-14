import type { z } from "zod";
import type { claimInput, commitInput, renewInput } from "./contracts";
import { notOperated, operate, requestOutcome } from "./database";

const leaseMs = 300000;
export async function claimRequest(
	db: D1Database,
	input: z.infer<typeof claimInput>,
) {
	const claimId = crypto.randomUUID();
	const expiresAt = Date.now() + leaseMs;
	const now = Date.now();
	return operate(
		db,
		input,
		"claim",
		input,
		[
			{
				sql: `INSERT INTO request_claims(id,request_id,machine_id,operation_id,expires_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cloud_requests r WHERE r.id=? AND r.status='submitted' AND r.imported_at IS NULL AND r.state_version=? AND (r.claim_id IS NULL OR EXISTS(SELECT 1 FROM request_claims c WHERE c.id=r.claim_id AND c.expires_at<=? AND c.committed_at IS NULL))) AND ${notOperated}`,
				values: [
					claimId,
					input.id,
					input.machineId,
					input.operationId,
					expiresAt,
					input.id,
					input.expectedStateVersion,
					now,
					input.operationId,
				],
			},
			{
				sql: "UPDATE cloud_requests SET claim_id=?,state_version=state_version+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM request_claims WHERE id=?)",
				values: [claimId, now, input.id, claimId],
			},
		],
		{
			sql: `SELECT json_object('result',CASE WHEN EXISTS(SELECT 1 FROM request_claims WHERE id=?) THEN 'claimed' WHEN NOT EXISTS(SELECT 1 FROM cloud_requests WHERE id=?) THEN 'unknown-id' ELSE 'state-conflict' END,'claimId',(SELECT id FROM request_claims WHERE id=?),'expiresAt',(SELECT expires_at FROM request_claims WHERE id=?),'remote',json((SELECT ${importRequestJson()} FROM cloud_requests r WHERE r.id=?)))`,
			values: [claimId, input.id, claimId, claimId, input.id],
		},
	);
}
function importRequestJson() {
	return `json_object('id',r.id,'stateVersion',r.state_version,'remoteVersion',r.publication_version,'status',r.status,'localReference',r.local_reference,'importedAt',r.imported_at,'claimId',r.claim_id)`;
}
export async function renewClaim(
	db: D1Database,
	input: z.infer<typeof renewInput>,
) {
	const expiresAt = Date.now() + leaseMs;
	return operate(
		db,
		input,
		"renew",
		input,
		[
			{
				sql: `UPDATE request_claims SET expires_at=? WHERE id=? AND machine_id=? AND committed_at IS NULL AND EXISTS(SELECT 1 FROM cloud_requests WHERE id=? AND claim_id=? AND state_version=? AND status='submitted' AND imported_at IS NULL) AND ${notOperated}`,
				values: [
					expiresAt,
					input.claimId,
					input.machineId,
					input.id,
					input.claimId,
					input.expectedStateVersion,
					input.operationId,
				],
			},
		],
		{
			sql: `SELECT json_object('result',CASE WHEN changes()>0 THEN 'renewed' ELSE 'state-conflict' END,'claimId',?,'expiresAt',(SELECT expires_at FROM request_claims WHERE id=?),'remote',json((SELECT ${importRequestJson()} FROM cloud_requests r WHERE r.id=?)))`,
			values: [input.claimId, input.claimId, input.id],
		},
	);
}
export async function commitClaim(
	db: D1Database,
	input: z.infer<typeof commitInput>,
) {
	const now = Date.now();
	const fingerprint = JSON.stringify({
		localReference: input.localReference,
		status: "pending",
		canCancel: false,
		cancellationResolved: false,
	});
	return operate(
		db,
		input,
		"commit",
		input,
		[
			{
				sql: `UPDATE cloud_requests SET status='pending',local_reference=?,imported_at=?,publication_version=?,publication_fingerprint=?,state_version=state_version+1,can_cancel=0,updated_at=? WHERE id=? AND claim_id=? AND status='submitted' AND imported_at IS NULL AND state_version=? AND publication_version < ? AND EXISTS(SELECT 1 FROM request_claims WHERE id=? AND machine_id=? AND committed_at IS NULL AND expires_at>?) AND ${notOperated}`,
				values: [
					input.localReference,
					now,
					input.version,
					fingerprint,
					now,
					input.id,
					input.claimId,
					input.expectedStateVersion,
					input.version,
					input.claimId,
					input.machineId,
					now,
					input.operationId,
				],
			},
			{
				sql: "UPDATE request_claims SET committed_at=?,local_reference=?,version=? WHERE id=? AND machine_id=? AND committed_at IS NULL AND EXISTS(SELECT 1 FROM cloud_requests WHERE id=? AND claim_id=? AND imported_at=? AND local_reference=?)",
				values: [
					now,
					input.localReference,
					input.version,
					input.claimId,
					input.machineId,
					input.id,
					input.claimId,
					now,
					input.localReference,
				],
			},
		],
		{
			sql: requestOutcome(
				`CASE WHEN NOT EXISTS(SELECT 1 FROM cloud_requests WHERE id=?) THEN 'unknown-id' WHEN EXISTS(SELECT 1 FROM request_claims WHERE id=? AND machine_id=? AND committed_at IS NOT NULL AND local_reference=? AND version=?) THEN 'committed' WHEN EXISTS(SELECT 1 FROM cloud_requests WHERE id=? AND claim_id<>?) THEN 'state-conflict' WHEN EXISTS(SELECT 1 FROM request_claims WHERE id=? AND expires_at<=? AND committed_at IS NULL) THEN 'claim-expired' ELSE 'state-conflict' END`,
			),
			values: [
				input.id,
				input.claimId,
				input.machineId,
				input.localReference,
				input.version,
				input.id,
				input.claimId,
				input.claimId,
				now,
				input.id,
			],
		},
	);
}
