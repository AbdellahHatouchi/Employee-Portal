import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const syncNonces = sqliteTable("sync_nonces", {
	nonce: text("nonce").primaryKey(),
	expiresAt: integer("expires_at").notNull(),
});
