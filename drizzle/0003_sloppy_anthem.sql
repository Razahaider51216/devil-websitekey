CREATE TABLE `flow_verifications` (
	`flow_id` text PRIMARY KEY NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`flow_id`) REFERENCES `flows`(`id`) ON UPDATE no action ON DELETE no action
);
