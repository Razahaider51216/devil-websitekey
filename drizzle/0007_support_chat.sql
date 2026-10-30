CREATE TABLE `support_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`client_id` text NOT NULL,
	`author_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`image_key` text,
	`image_type` text,
	`image_bytes` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `support_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `support_messages_thread_idx` ON `support_messages` (`thread_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `support_messages_retry_idx` ON `support_messages` (`thread_id`,`author_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `support_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`updated_at` integer NOT NULL,
	`preview` text DEFAULT '' NOT NULL,
	`last_message_id` integer DEFAULT 0 NOT NULL,
	`last_user_id` integer DEFAULT 0 NOT NULL,
	`last_admin_id` integer DEFAULT 0 NOT NULL,
	`admin_read_id` integer DEFAULT 0 NOT NULL,
	`user_read_id` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_threads_owner_id_unique` ON `support_threads` (`owner_id`);--> statement-breakpoint
CREATE INDEX `support_threads_last_message_idx` ON `support_threads` (`last_message_id`);
