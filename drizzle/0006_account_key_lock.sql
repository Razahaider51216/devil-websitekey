ALTER TABLE `flows` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `access_keys` ADD `owner_id` text;--> statement-breakpoint
CREATE INDEX `access_keys_owner_expiry_idx` ON `access_keys` (`owner_id`,`expires_at`);