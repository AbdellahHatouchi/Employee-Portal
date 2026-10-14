CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_products` (
	`id` text PRIMARY KEY,
	`label` text NOT NULL,
	`unit` text NOT NULL,
	`available` integer NOT NULL,
	`version` integer NOT NULL,
	`published_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloud_request_items` (
	`request_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` real NOT NULL,
	`label` text NOT NULL,
	`unit` text NOT NULL,
	CONSTRAINT `cloud_request_items_pk` PRIMARY KEY(`request_id`, `product_id`),
	CONSTRAINT `fk_cloud_request_items_request_id_cloud_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `cloud_requests`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `cloud_requests` (
	`id` text PRIMARY KEY,
	`employee_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`local_reference` text,
	`can_cancel` integer DEFAULT true NOT NULL,
	`cancel_requested_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`state_version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_cloud_requests_employee_id_user_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `user`(`id`)
);
--> statement-breakpoint
CREATE TABLE `employee_accounts` (
	`user_id` text PRIMARY KEY,
	`local_employee_id` text NOT NULL UNIQUE,
	`enabled` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_employee_accounts_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_nonces` (
	`nonce` text PRIMARY KEY,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `catalog_available_idx` ON `catalog_products` (`available`);--> statement-breakpoint
CREATE UNIQUE INDEX `request_idempotency_idx` ON `cloud_requests` (`employee_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `request_employee_created_idx` ON `cloud_requests` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `request_status_idx` ON `cloud_requests` (`status`);