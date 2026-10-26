CREATE TABLE `flows` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text,
	`key_hash` text NOT NULL,
	`label` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`duration_kind` text NOT NULL,
	`duration_amount` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_keys_flow_id_unique` ON `access_keys` (`flow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_keys_key_hash_unique` ON `access_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `steps` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text NOT NULL,
	`number` integer NOT NULL,
	`opened_at` integer,
	`returned_at` integer,
	`link_hash` text NOT NULL,
	FOREIGN KEY (`flow_id`) REFERENCES `flows`(`id`) ON UPDATE no action ON DELETE no action
);
