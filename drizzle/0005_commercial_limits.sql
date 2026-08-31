ALTER TABLE `tenants` ADD `product_tier` text DEFAULT 'owner' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tenants` ADD `campaign_limit` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `tenants` ADD `player_limit` integer DEFAULT 8 NOT NULL;
