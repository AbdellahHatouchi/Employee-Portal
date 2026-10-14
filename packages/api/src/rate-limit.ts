import type { Database } from "@store-managment-communal-web/db";
import { rateLimit } from "@store-managment-communal-web/db/schema/portal";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export async function limitSubmissions(db: Database, employeeId: string) {
	const now = Date.now();
	const [result] = await db
		.insert(rateLimit)
		.values({
			id: crypto.randomUUID(),
			key: `portal:submit:${employeeId}`,
			count: 1,
			lastRequest: now,
		})
		.onConflictDoUpdate({
			target: rateLimit.key,
			set: {
				count: sql`case when ${rateLimit.lastRequest} < ${now - 60000} then 1 else ${rateLimit.count} + 1 end`,
				lastRequest: sql`case when ${rateLimit.lastRequest} < ${now - 60000} then ${now} else ${rateLimit.lastRequest} end`,
			},
		})
		.returning({ count: rateLimit.count });
	if (!result || result.count > 10)
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Please wait before submitting again",
		});
}
