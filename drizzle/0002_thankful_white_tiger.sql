CREATE TABLE `account_pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`account_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `player_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_pairing_codes_hash_unique` ON `account_pairing_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `account_pairing_codes_expiry_idx` ON `account_pairing_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `player_account_characters` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_uuid` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `player_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_account_characters_unique` ON `player_account_characters` (`account_id`,`actor_uuid`);--> statement-breakpoint
CREATE INDEX `player_account_characters_actor_idx` ON `player_account_characters` (`campaign_id`,`actor_uuid`);--> statement-breakpoint
CREATE TABLE `player_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`foundry_user_id` text NOT NULL,
	`player_label` text NOT NULL,
	`credential_hash` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_accounts_campaign_user_unique` ON `player_accounts` (`campaign_id`,`foundry_user_id`);--> statement-breakpoint
CREATE INDEX `player_accounts_campaign_idx` ON `player_accounts` (`campaign_id`);--> statement-breakpoint
ALTER TABLE `player_sessions` ADD `account_id` text REFERENCES player_accounts(id);