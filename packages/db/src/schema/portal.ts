import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const employeeAccounts = sqliteTable("employee_accounts", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	localEmployeeId: text("local_employee_id").notNull().unique(),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	version: integer("version").notNull().default(1),
	invitedAt: integer("invited_at"),
	emailRevision: integer("email_revision").notNull().default(1),
	activatedRevision: integer("activated_revision").notNull().default(0),
	invitationState: text("invitation_state").notNull().default("none"),
	publicationFingerprint: text("publication_fingerprint"),
});

export const catalogProducts = sqliteTable(
	"catalog_products",
	{
		id: text("id").primaryKey(),
		label: text("label").notNull(),
		unit: text("unit").notNull(),
		available: integer("available", { mode: "boolean" }).notNull(),
		version: integer("version").notNull(),
		publishedAt: integer("published_at").notNull(),
	},
	(t) => [index("catalog_available_idx").on(t.available)],
);

export const requestStatuses = [
	"submitted",
	"pending",
	"accepted",
	"refused",
	"cancelled",
	"delivered",
] as const;
export const cloudRequests = sqliteTable(
	"cloud_requests",
	{
		id: text("id").primaryKey(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => user.id),
		idempotencyKey: text("idempotency_key").notNull(),
		fingerprint: text("fingerprint").notNull(),
		status: text("status", { enum: requestStatuses })
			.notNull()
			.default("submitted"),
		note: text("note").notNull().default(""),
		localReference: text("local_reference"),
		canCancel: integer("can_cancel", { mode: "boolean" })
			.notNull()
			.default(true),
		cancelRequestedAt: integer("cancel_requested_at"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
		stateVersion: integer("state_version").notNull().default(0),
		publicationVersion: integer("publication_version").notNull().default(0),
		publicationFingerprint: text("publication_fingerprint"),
		claimId: text("claim_id"),
		importedAt: integer("imported_at"),
		dispositionReason: text("disposition_reason"),
	},
	(t) => [
		uniqueIndex("request_idempotency_idx").on(t.employeeId, t.idempotencyKey),
		index("request_employee_created_idx").on(t.employeeId, t.createdAt),
		index("request_status_idx").on(t.status),
	],
);

export const cloudRequestItems = sqliteTable(
	"cloud_request_items",
	{
		requestId: text("request_id")
			.notNull()
			.references(() => cloudRequests.id, { onDelete: "cascade" }),
		productId: text("product_id").notNull(),
		quantity: real("quantity").notNull(),
		label: text("label").notNull(),
		unit: text("unit").notNull(),
	},
	(t) => [primaryKey({ columns: [t.requestId, t.productId] })],
);

export const syncState = sqliteTable("sync_state", {
	key: text("key").primaryKey(),
	version: integer("version").notNull(),
	updatedAt: integer("updated_at").notNull(),
	fingerprint: text("fingerprint"),
});

export const rateLimit = sqliteTable("rate_limit", {
	id: text("id").primaryKey(),
	key: text("key").notNull().unique(),
	count: integer("count").notNull(),
	lastRequest: integer("last_request").notNull(),
});
