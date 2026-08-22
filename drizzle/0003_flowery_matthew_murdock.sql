CREATE TABLE `phone_access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`account_id` text NOT NULL,
	`request_token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`consumed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `player_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phone_access_requests_token_unique` ON `phone_access_requests` (`request_token_hash`);--> statement-breakpoint
CREATE INDEX `phone_access_requests_campaign_queue_idx` ON `phone_access_requests` (`campaign_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `phone_access_requests_expiry_idx` ON `phone_access_requests` (`expires_at`);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `pairing_password_hash` text;