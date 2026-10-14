import { createAuth as createConfiguredAuth } from "@store-managment-communal-web/auth";
import { type Database, createDb } from "@store-managment-communal-web/db";

import { ENV } from "./env.server";

export function getDb(): Database {
  return createDb(ENV);
}
export async function createAuth(database?: Database) {
  return createConfiguredAuth(ENV, database ?? (await getDb()));
}
