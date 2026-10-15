import { requirePasswordEmailAcceptance } from "@store-managment-communal-web/auth/invitation";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ENV } from "../env.server";
import { createAuth, getDb } from "../services";
import { authorizeSync, type SyncEnv } from "./authorization";
import { catalogueSync } from "./catalogue";
import { employeeSync } from "./employees";
import { requestSync } from "./requests";
import { createExchangeV2 } from "./v2";

export const sync = new Hono<SyncEnv>()
	.use("*", bodyLimit({ maxSize: 256 * 1024 }))
	.use("*", authorizeSync)
	.route(
		"/v2",
		createExchangeV2(
			() => getDb().$client,
			async (userId, attemptId) => {
				const db = getDb();
				const row = await db.$client
					.prepare(
						"SELECT u.email FROM user u JOIN employee_accounts e ON e.user_id=u.id JOIN invitation_attempts a ON a.user_id=u.id AND a.email_revision=e.email_revision WHERE u.id=? AND a.id=? AND e.enabled=1",
					)
					.bind(userId, attemptId)
					.first<{ email: string }>();
				if (!row) throw new Error("Invitation is no longer eligible");
				await requirePasswordEmailAcceptance(async (receipt) => {
					const auth = await createAuth(db, undefined, attemptId, receipt);
					await auth.api.requestPasswordReset({
						body: {
							email: row.email,
							redirectTo: `${ENV.CORS_ORIGIN}/activate`,
						},
					});
				});
			},
		),
	)
	.route("/catalogue", catalogueSync)
	.route("/employees", employeeSync)
	.route("/requests", requestSync);
