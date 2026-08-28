ALTER TABLE `campaigns` ADD `world_state` text DEFAULT 'sleeping' NOT NULL;
--> statement-breakpoint
ALTER TABLE `campaigns` ADD `active_until` integer;
--> statement-breakpoint
CREATE TABLE `chronicle_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`sender_account_id` text,
	`recipient_account_id` text,
	`channel` text NOT NULL,
	`author_label` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_account_id`) REFERENCES `player_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipient_account_id`) REFERENCES `player_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chronicle_messages_campaign_channel_idx` ON `chronicle_messages` (`campaign_id`,`channel`,`created_at`);
--> statement-breakpoint
CREATE INDEX `chronicle_messages_sender_idx` ON `chronicle_messages` (`sender_account_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `chronicle_messages_recipient_idx` ON `chronicle_messages` (`recipient_account_id`,`created_at`);
