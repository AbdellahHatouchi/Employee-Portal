import type { Session } from "@store-managment-communal-web/auth";
import type { Database } from "@store-managment-communal-web/db";

export type Context = {
  session: Session | null;
  db: Database;
};
