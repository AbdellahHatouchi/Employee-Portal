ALTER TABLE `employee_accounts` ADD `publication_fingerprint` text;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `fingerprint` text;--> statement-breakpoint
-- Preserve desktop version floors and historical official mappings.
UPDATE cloud_requests SET publication_version=state_version, imported_at=CASE WHEN local_reference IS NOT NULL THEN updated_at ELSE NULL END, can_cancel=CASE WHEN status='submitted' AND local_reference IS NULL THEN 1 ELSE 0 END;
--> statement-breakpoint
-- Existing credential holders stay active; new/unactivated identities remain gated.
UPDATE employee_accounts SET activated_revision=email_revision WHERE EXISTS(SELECT 1 FROM account WHERE account.user_id=employee_accounts.user_id AND provider_id='credential' AND password IS NOT NULL AND length(password)>0);
--> statement-breakpoint
UPDATE employee_accounts SET invitation_state=CASE WHEN invited_at IS NOT NULL THEN 'sent' ELSE 'none' END;
--> statement-breakpoint
-- Unbound legacy reset links cannot prove ownership after an email change.
DELETE FROM verification WHERE identifier LIKE 'reset-password:%';

