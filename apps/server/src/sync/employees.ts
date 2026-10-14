import { Hono } from "hono";
import { ENV } from "../env.server";
import { createAuth, getDb } from "../services";
import type { SyncEnv } from "./authorization";
import { employeesInput } from "./contracts";
import { publishEmployee } from "./v2/employees";
import { initialInvitation } from "./v2/lifecycle";
export const employeeSync = new Hono<SyncEnv>().post("/", async (c) => {
	const parsed = employeesInput.safeParse(JSON.parse(c.get("syncBody")));
	if (!parsed.success)
		return c.json({ error: "Invalid employee records" }, 400);
	const db = getDb();
	const results = [];
	for (const employee of parsed.data.employees) {
		const operationId = crypto.randomUUID();
		const publication = await publishEmployee(
			db.$client,
			"00000000-0000-4000-8000-000000000001",
			{ ...employee, operationId },
		);
		if (
			employee.invite &&
			["acknowledged", "equivalent"].includes(publication.result as string)
		)
			await initialInvitation(
				db.$client,
				employee.localEmployeeId,
				operationId,
				async (userId, attemptId) => {
					const row = await db.$client
						.prepare("SELECT email FROM user WHERE id=?")
						.bind(userId)
						.first<{ email: string }>();
					if (!row) throw new Error("Unknown employee");
					const auth = await createAuth(db, undefined, attemptId);
					await auth.api.requestPasswordReset({
						body: {
							email: row.email,
							redirectTo: `${ENV.CORS_ORIGIN}/activate`,
						},
					});
				},
			);
		results.push({
			localEmployeeId: employee.localEmployeeId,
			result: ["acknowledged", "equivalent"].includes(
				publication.result as string,
			)
				? "acknowledged"
				: publication.result === "stale" ||
						publication.result === "version-conflict"
					? "stale"
					: "retry",
		});
	}
	return c.json({ schemaVersion: 1, results });
});
