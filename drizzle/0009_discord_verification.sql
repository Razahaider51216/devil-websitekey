CREATE TABLE `discord_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`interaction_id` text NOT NULL,
	`user_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`role_id` text NOT NULL,
	`role_name` text NOT NULL,
	`guild_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`approved_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_verifications_interaction_id_unique` ON `discord_verifications` (`interaction_id`);--> statement-breakpoint
CREATE INDEX `discord_verifications_expiry_idx` ON `discord_verifications` (`expires_at`);