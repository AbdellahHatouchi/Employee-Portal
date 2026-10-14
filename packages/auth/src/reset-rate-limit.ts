import type { Database } from "@store-managment-communal-web/db";

// Cloudflare supplies the client IP. Do not trust caller-supplied forwarded headers.
export async function allowPasswordReset(db: Database, clientIp: string) {
	const now = Date.now();
	const row = await db.$client
		.prepare(
			"INSERT INTO rate_limit(id,key,count,last_request) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN last_request<? THEN 1 ELSE count+1 END,last_request=CASE WHEN last_request<? THEN excluded.last_request ELSE last_request END RETURNING count",
		)
		.bind(
			crypto.randomUUID(),
			`portal:password-reset:${clientIp}`,
			now,
			now - 60000,
			now - 60000,
		)
		.first<{ count: number }>();
	return !!row && row.count <= 10;
}
