import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { cloudRequests } from "./portal";
export const exchangeOperations = sqliteTable("exchange_operations", {
	id: text("id").primaryKey(),
	machineId: text("machine_id").notNull(),
	kind: text("kind").notNull(),
	fingerprint: text("fingerprint").notNull(),
	result: text("result").notNull(),
	createdAt: integer("created_at").notNull(),
});
export const requestClaims = sqliteTable(
	"request_claims",
	{
		id: text("id").primaryKey(),
		requestId: text("request_id")
			.notNull()
			.references(() => cloudRequests.id),
		machineId: text("machine_id").notNull(),
		operationId: text("operation_id").notNull().unique(),
		expiresAt: integer("expires_at").notNull(),
		committedAt: integer("committed_at"),
		localReference: text("local_reference"),
		version: integer("version"),
	},
	(t) => [index("claim_request_idx").on(t.requestId)],
);
export const reconciliationSessions = sqliteTable("reconciliation_sessions", {
	id: text("id").primaryKey(),
	machineId: text("machine_id").notNull(),
	createdAt: integer("created_at").notNull(),
	expiresAt: integer("expires_at").notNull(),
	highWater: integer("high_water").notNull(),
});
export const reconciliationRecords = sqliteTable(
	"reconciliation_records",
	{
		sessionId: text("session_id")
			.notNull()
			.references(() => reconciliationSessions.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		payload: text("payload").notNull(),
	},
	(t) => [primaryKey({ columns: [t.sessionId, t.key] })],
);
export const catalogueStages = sqliteTable("catalogue_stages", {
	id: text("id").primaryKey(),
	machineId: text("machine_id").notNull(),
	version: integer("version").notNull(),
	expectedProducts: integer("expected_products").notNull(),
	expectedChunks: integer("expected_chunks").notNull(),
	digest: text("digest").notNull(),
	expiresAt: integer("expires_at").notNull(),
	committedAt: integer("committed_at"),
});
export const catalogueChunks = sqliteTable(
	"catalogue_chunks",
	{
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => catalogueStages.id, { onDelete: "cascade" }),
		chunkIndex: integer("chunk_index").notNull(),
		payload: text("payload").notNull(),
		digest: text("digest").notNull(),
	},
	(t) => [primaryKey({ columns: [t.snapshotId, t.chunkIndex] })],
);
export const portalPasswordTokens = sqliteTable("portal_password_tokens", {
	identifier: text("identifier").primaryKey(),
	userId: text("user_id").notNull(),
	emailRevision: integer("email_revision").notNull(),
	email: text("email").notNull(),
	expiresAt: integer("expires_at").notNull(),
});
export const invitationAttempts = sqliteTable("invitation_attempts", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	emailRevision: integer("email_revision").notNull(),
	state: text("state").notNull(),
	createdAt: integer("created_at").notNull(),
	finishedAt: integer("finished_at"),
});
