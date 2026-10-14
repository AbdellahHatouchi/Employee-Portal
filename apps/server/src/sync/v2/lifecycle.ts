import type { z } from "zod";
import type { lifecycleInput, resendInput } from "./contracts";
import { all, first, notOperated, operate } from "./database";
export type InvitationSender = (
	userId: string,
	attemptId: string,
) => Promise<void>;
export async function lookupLifecycle(
	db: D1Database,
	input: z.infer<typeof lifecycleInput>,
) {
	const rows = await all<{
		local_employee_id: string;
		enabled: number;
		email_revision: number;
		activated_revision: number;
		invitation_state: string;
		invited_at: number | null;
		version: number;
	}>(
		db,
		"SELECT * FROM employee_accounts WHERE local_employee_id IN (" +
			input.employeeIds.map(() => "?").join(",") +
			")",
		...input.employeeIds,
	);
	const found = new Map(rows.map((e) => [e.local_employee_id, e]));
	return {
		employees: input.employeeIds.map((id) => {
			const e = found.get(id);
			return e
				? {
						localEmployeeId: id,
						enabled: !!e.enabled,
						activated: e.email_revision === e.activated_revision,
						emailRevision: e.email_revision,
						remoteVersion: e.version,
						invitationState: e.invitation_state,
						invitedAt: e.invited_at,
						emailChangeState:
							e.activated_revision === e.email_revision
								? "verified"
								: "verification-required",
					}
				: { localEmployeeId: id, result: "unknown-id" };
		}),
	};
}
export async function deliverInvitation(
	db: D1Database,
	userId: string,
	attemptId: string,
	send: InvitationSender,
) {
	const attempt = await first<{ email_revision: number; state: string }>(
		db,
		"SELECT * FROM invitation_attempts WHERE id=? AND user_id=?",
		attemptId,
		userId,
	);
	if (attempt?.state !== "queued") return;
	const claim = await db
		.prepare(
			"UPDATE invitation_attempts SET state='sending' WHERE id=? AND state='queued' RETURNING id",
		)
		.bind(attemptId)
		.all();
	if (!claim.results.length) return;
	let state = "sent";
	try {
		await send(userId, attemptId);
	} catch {
		state = "failed";
	}
	await db.batch([
		db
			.prepare(
				"UPDATE invitation_attempts SET state=?,finished_at=? WHERE id=? AND state='sending'",
			)
			.bind(state, Date.now(), attemptId),
		db
			.prepare(
				"UPDATE employee_accounts SET invitation_state=? WHERE user_id=? AND email_revision=? AND invited_at=(SELECT created_at FROM invitation_attempts WHERE id=?)",
			)
			.bind(state, userId, attempt.email_revision, attemptId),
	]);
}
export async function resendInvitation(
	db: D1Database,
	input: z.infer<typeof resendInput>,
	send: InvitationSender,
) {
	const now = Date.now();
	const attemptId = input.operationId;
	const result = await operate(
		db,
		input,
		"resend",
		input,
		[
			{
				sql: `INSERT INTO invitation_attempts(id,user_id,email_revision,state,created_at) SELECT ?,user_id,email_revision,'queued',? FROM employee_accounts WHERE local_employee_id=? AND enabled=1 AND activated_revision<>email_revision AND (invited_at IS NULL OR invited_at<=?) AND ${notOperated}`,
				values: [
					attemptId,
					now,
					input.localEmployeeId,
					now - 60000,
					input.operationId,
				],
			},
			{
				sql: `UPDATE employee_accounts SET invited_at=?,invitation_state='queued' WHERE user_id=(SELECT user_id FROM invitation_attempts WHERE id=?) AND email_revision=(SELECT email_revision FROM invitation_attempts WHERE id=?) AND ${notOperated}`,
				values: [now, attemptId, attemptId, input.operationId],
			},
		],
		{
			sql: `SELECT json_object('result',CASE WHEN EXISTS(SELECT 1 FROM invitation_attempts WHERE id=?) THEN 'queued' WHEN NOT EXISTS(SELECT 1 FROM employee_accounts WHERE local_employee_id=?) THEN 'unknown-id' WHEN EXISTS(SELECT 1 FROM employee_accounts WHERE local_employee_id=? AND enabled=0) THEN 'disabled' WHEN EXISTS(SELECT 1 FROM employee_accounts WHERE local_employee_id=? AND activated_revision=email_revision) THEN 'already-activated' ELSE 'cooldown' END,'retryAfterSeconds',CASE WHEN EXISTS(SELECT 1 FROM invitation_attempts WHERE id=?) THEN 60 ELSE max(0,CAST(((SELECT coalesce(invited_at,0)+60000 FROM employee_accounts WHERE local_employee_id=?) - ? +999)/1000 AS INTEGER)) END)`,
			values: [
				attemptId,
				input.localEmployeeId,
				input.localEmployeeId,
				input.localEmployeeId,
				attemptId,
				input.localEmployeeId,
				now,
			],
		},
	);
	const row = await first<{ user_id: string }>(
		db,
		"SELECT user_id FROM invitation_attempts WHERE id=?",
		attemptId,
	);
	if (row && result.result === "queued")
		await deliverInvitation(db, row.user_id, attemptId, send);
	return {
		...result,
		...(await lookupLifecycle(db, {
			schemaVersion: 2,
			machineId: input.machineId,
			employeeIds: [input.localEmployeeId],
		})),
	};
}
export async function initialInvitation(
	db: D1Database,
	localEmployeeId: string,
	operationId: string,
	send: InvitationSender,
) {
	const now = Date.now();
	const attemptId = `initial:${operationId}`;
	await db.batch([
		db
			.prepare(
				"INSERT INTO invitation_attempts(id,user_id,email_revision,state,created_at) SELECT ?,user_id,email_revision,'queued',? FROM employee_accounts WHERE local_employee_id=? AND enabled=1 AND activated_revision<>email_revision AND invitation_state='none' ON CONFLICT(id) DO NOTHING",
			)
			.bind(attemptId, now, localEmployeeId),
		db
			.prepare(
				"UPDATE employee_accounts SET invited_at=?,invitation_state='queued' WHERE user_id=(SELECT user_id FROM invitation_attempts WHERE id=?) AND email_revision=(SELECT email_revision FROM invitation_attempts WHERE id=?) AND invitation_state='none'",
			)
			.bind(now, attemptId, attemptId),
	]);
	const row = await first<{ user_id: string }>(
		db,
		"SELECT user_id FROM invitation_attempts WHERE id=?",
		attemptId,
	);
	if (row) await deliverInvitation(db, row.user_id, attemptId, send);
}
