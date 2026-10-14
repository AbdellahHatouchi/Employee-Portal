import type { z } from "zod";
import type { employeeRecord } from "./contracts";
import { canonical, notOperated, operate } from "./database";
export async function publishEmployee(
	db: D1Database,
	machineId: string,
	input: z.infer<typeof employeeRecord>,
) {
	const userId = crypto.randomUUID();
	const now = Date.now();
	const fingerprint = canonical({
		name: input.name,
		email: input.email,
		enabled: input.enabled,
	});
	const eligible = `EXISTS(SELECT 1 FROM employee_accounts e JOIN user u ON u.id=e.user_id WHERE e.local_employee_id=? AND e.version<? AND u.email<>?) AND ${notOperated}`;
	const emailArgs = [
		input.localEmployeeId,
		input.version,
		input.email,
		input.operationId,
	];
	try {
		return {
			localEmployeeId: input.localEmployeeId,
			attemptedVersion: input.version,
			...(await operate(
				db,
				{ ...input, machineId },
				"employee",
				input,
				[
					{
						sql: `INSERT INTO user(id,name,email,email_verified,created_at,updated_at) SELECT ?,?,?,0,?,? WHERE NOT EXISTS(SELECT 1 FROM employee_accounts WHERE local_employee_id=?) AND ${notOperated}`,
						values: [
							userId,
							input.name,
							input.email,
							now,
							now,
							input.localEmployeeId,
							input.operationId,
						],
					},
					{
						sql: `INSERT INTO employee_accounts(user_id,local_employee_id,enabled,version,email_revision,activated_revision,invitation_state,publication_fingerprint) SELECT ?,?,?,?,1,0,'none',? WHERE EXISTS(SELECT 1 FROM user WHERE id=?) AND ${notOperated}`,
						values: [
							userId,
							input.localEmployeeId,
							input.enabled,
							input.version,
							fingerprint,
							userId,
							input.operationId,
						],
					},
					{
						sql: `DELETE FROM session WHERE user_id=(SELECT user_id FROM employee_accounts WHERE local_employee_id=?) AND (${eligible} OR (EXISTS(SELECT 1 FROM employee_accounts WHERE local_employee_id=? AND version<?) AND ?=0 AND ${notOperated}))`,
						values: [
							input.localEmployeeId,
							...emailArgs,
							input.localEmployeeId,
							input.version,
							input.enabled,
							input.operationId,
						],
					},
					{
						sql: `DELETE FROM verification WHERE value=(SELECT user_id FROM employee_accounts WHERE local_employee_id=?) AND ${eligible}`,
						values: [input.localEmployeeId, ...emailArgs],
					},
					{
						sql: `DELETE FROM portal_password_tokens WHERE user_id=(SELECT user_id FROM employee_accounts WHERE local_employee_id=?) AND ${eligible}`,
						values: [input.localEmployeeId, ...emailArgs],
					},
					{
						sql: `UPDATE employee_accounts SET enabled=?,version=?,publication_fingerprint=?,email_revision=email_revision+CASE WHEN (SELECT email FROM user WHERE id=user_id)<>? THEN 1 ELSE 0 END,activated_revision=CASE WHEN (SELECT email FROM user WHERE id=user_id)<>? THEN 0 ELSE activated_revision END,invitation_state=CASE WHEN (SELECT email FROM user WHERE id=user_id)<>? THEN 'none' ELSE invitation_state END,invited_at=CASE WHEN (SELECT email FROM user WHERE id=user_id)<>? THEN NULL ELSE invited_at END WHERE local_employee_id=? AND version<? AND ${notOperated}`,
						values: [
							input.enabled,
							input.version,
							fingerprint,
							input.email,
							input.email,
							input.email,
							input.email,
							input.localEmployeeId,
							input.version,
							input.operationId,
						],
					},
					{
						sql: `UPDATE user SET name=?,email=?,email_verified=CASE WHEN email<>? THEN 0 ELSE email_verified END,updated_at=? WHERE id=(SELECT user_id FROM employee_accounts WHERE local_employee_id=? AND version=? AND publication_fingerprint=?) AND ${notOperated}`,
						values: [
							input.name,
							input.email,
							input.email,
							now,
							input.localEmployeeId,
							input.version,
							fingerprint,
							input.operationId,
						],
					},
				],
				{
					sql: `SELECT json_object('result',CASE WHEN NOT EXISTS(SELECT 1 FROM employee_accounts WHERE local_employee_id=?) THEN 'unknown-id' WHEN (SELECT version FROM employee_accounts WHERE local_employee_id=?)>? THEN 'stale' WHEN EXISTS(SELECT 1 FROM employee_accounts e JOIN user u ON u.id=e.user_id WHERE e.local_employee_id=? AND e.version=? AND u.name=? AND u.email=? AND e.enabled=?) THEN CASE WHEN changes()>0 THEN 'acknowledged' ELSE 'equivalent' END ELSE 'version-conflict' END,'remoteVersion',(SELECT version FROM employee_accounts WHERE local_employee_id=?),'emailRevision',(SELECT email_revision FROM employee_accounts WHERE local_employee_id=?))`,
					values: [
						input.localEmployeeId,
						input.localEmployeeId,
						input.version,
						input.localEmployeeId,
						input.version,
						input.name,
						input.email,
						input.enabled,
						input.localEmployeeId,
						input.localEmployeeId,
					],
				},
			)),
		};
	} catch (error) {
		if (String(error).includes("UNIQUE"))
			return {
				localEmployeeId: input.localEmployeeId,
				attemptedVersion: input.version,
				result: "email-conflict",
				replayed: false,
			};
		throw error;
	}
}
