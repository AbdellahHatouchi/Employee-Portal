import { createAuth as createConfiguredAuth } from "@store-managment-communal-web/auth";
import type { PasswordEmailReceipt } from "@store-managment-communal-web/auth/email";
import { createDb, type Database } from "@store-managment-communal-web/db";

import { ENV } from "./env.server";

export function getDb(): Database {
	return createDb(ENV);
}
export async function createAuth(
	database?: Database,
	backgroundTask?: (task: Promise<unknown>) => void,
	mailIdempotencyKey?: string,
	mailReceipt?: PasswordEmailReceipt,
) {
	return createConfiguredAuth(
		ENV,
		database ?? (await getDb()),
		[],
		backgroundTask,
		mailIdempotencyKey,
		mailReceipt,
	);
}
