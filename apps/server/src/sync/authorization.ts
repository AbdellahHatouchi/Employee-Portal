import { ENV } from "../env.server";
import { getDb } from "../services";
import { createMachineAuthorization } from "./machine-auth";

export type { SyncEnv } from "./machine-auth";
export const authorizeSync = createMachineAuthorization(
	() => getDb().$client,
	() => ENV.SYNC_SECRET,
);
