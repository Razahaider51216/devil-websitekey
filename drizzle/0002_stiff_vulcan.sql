CREATE TABLE `key_devices` (
	`key_id` text PRIMARY KEY NOT NULL,
	`hwid_hash` text NOT NULL,
	`bound_at` integer NOT NULL,
	FOREIGN KEY (`key_id`) REFERENCES `access_keys`(`id`) ON UPDATE no action ON DELETE no action
);
