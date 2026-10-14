import type { Database } from "@store-managment-communal-web/db";
import { z } from "zod";
export const portalResetInput = z
	.object({
		token: z.string().min(1).max(200),
		newPassword: z.string().min(8).max(128),
	})
	.strict();
const eligible =
	"EXISTS(SELECT 1 FROM verification v JOIN portal_password_tokens p ON p.identifier=v.identifier JOIN employee_accounts e ON e.user_id=p.user_id JOIN user u ON u.id=e.user_id WHERE v.identifier=? AND v.value=e.user_id AND v.expires_at>? AND p.expires_at>? AND e.enabled=1 AND p.email_revision=e.email_revision AND p.email=u.email AND e.user_id=?)";
export async function completePasswordReset(
	database: Database,
	input: z.infer<typeof portalResetInput>,
	hashPassword: (password: string) => Promise<string>,
) {
	const db = database.$client;
	const identifier = `reset-password:${input.token}`;
	const now = Date.now();
	const token = await db
		.prepare(
			"SELECT user_id FROM portal_password_tokens WHERE identifier=? AND expires_at>?",
		)
		.bind(identifier, now)
		.first<{ user_id: string }>();
	if (!token) return false;
	const password = await hashPassword(input.newPassword);
	const args = [identifier, Date.now(), Date.now(), token.user_id];
	const result = await db.batch([
		db
			.prepare(
				`INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) SELECT coalesce((SELECT id FROM account WHERE user_id=? AND provider_id='credential' LIMIT 1),?),?,'credential',?,?,?,? WHERE ${eligible} ON CONFLICT(id) DO UPDATE SET password=excluded.password,updated_at=excluded.updated_at`,
			)
			.bind(
				token.user_id,
				`portal-credential:${token.user_id}`,
				token.user_id,
				token.user_id,
				password,
				now,
				now,
				...args,
			),
		// Accounts provisioned by v1 may have a differently named credential row.
		db
			.prepare(
				`UPDATE account SET password=?,updated_at=? WHERE user_id=? AND provider_id='credential' AND ${eligible}`,
			)
			.bind(password, now, token.user_id, ...args),
		db
			.prepare(
				`UPDATE employee_accounts SET activated_revision=email_revision WHERE user_id=? AND ${eligible}`,
			)
			.bind(token.user_id, ...args),
		db
			.prepare(
				`UPDATE user SET email_verified=1,updated_at=? WHERE id=? AND ${eligible}`,
			)
			.bind(now, token.user_id, ...args),
		db
			.prepare(`DELETE FROM session WHERE user_id=? AND ${eligible}`)
			.bind(token.user_id, ...args),
		db
			.prepare(
				`DELETE FROM verification WHERE identifier=? AND ${eligible} RETURNING id`,
			)
			.bind(identifier, ...args),
		db
			.prepare(
				"DELETE FROM portal_password_tokens WHERE identifier=? AND NOT EXISTS(SELECT 1 FROM verification WHERE identifier=?)",
			)
			.bind(identifier, identifier),
	]);
	return result[5]?.results.length === 1;
}
