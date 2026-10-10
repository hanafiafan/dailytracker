CREATE TABLE `chat_group_members` (
	`group_id` text NOT NULL,
	`email` text NOT NULL,
	PRIMARY KEY(`group_id`, `email`),
	FOREIGN KEY (`group_id`) REFERENCES `chat_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
