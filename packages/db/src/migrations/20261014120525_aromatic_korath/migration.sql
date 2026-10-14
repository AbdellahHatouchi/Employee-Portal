CREATE TABLE `catalogue_chunks` (
	`snapshot_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL,
	CONSTRAINT `catalogue_chunks_pk` PRIMARY KEY(`snapshot_id`, `chunk_index`),
	CONSTRAINT `fk_catalogue_chunks_snapshot_id_catalogue_stages_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `catalogue_stages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `catalogue_stages` (
	`id` text PRIMARY KEY,
	`machine_id` text NOT NULL,
	`version` integer NOT NULL,
	`expected_products` integer NOT NULL,
	`expected_chunks` integer NOT NULL,
	`digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`committed_at` integer
);
--> statement-breakpoint
CREATE TABLE `exchange_operations` (
	`id` text PRIMARY KEY,
	`machine_id` text NOT NULL,
	`kind` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invitation_attempts` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`email_revision` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `portal_password_tokens` (
	`identifier` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`email_revision` integer NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reconciliation_records` (
	`session_id` text NOT NULL,
	`key` text NOT NULL,
	`payload` text NOT NULL,
	CONSTRAINT `reconciliation_records_pk` PRIMARY KEY(`session_id`, `key`),
	CONSTRAINT `fk_reconciliation_records_session_id_reconciliation_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `reconciliation_sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `reconciliation_sessions` (
	`id` text PRIMARY KEY,
	`machine_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`high_water` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_claims` (
	`id` text PRIMARY KEY,
	`request_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`operation_id` text NOT NULL UNIQUE,
	`expires_at` integer NOT NULL,
	`committed_at` integer,
	`local_reference` text,
	`version` integer,
	CONSTRAINT `fk_request_claims_request_id_cloud_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `cloud_requests`(`id`)
);
--> statement-breakpoint
ALTER TABLE `cloud_requests` ADD `publication_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cloud_requests` ADD `publication_fingerprint` text;--> statement-breakpoint
ALTER TABLE `cloud_requests` ADD `claim_id` text;--> statement-breakpoint
ALTER TABLE `cloud_requests` ADD `imported_at` integer;--> statement-breakpoint
ALTER TABLE `cloud_requests` ADD `disposition_reason` text;--> statement-breakpoint
ALTER TABLE `employee_accounts` ADD `email_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_accounts` ADD `activated_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_accounts` ADD `invitation_state` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE INDEX `claim_request_idx` ON `request_claims` (`request_id`);