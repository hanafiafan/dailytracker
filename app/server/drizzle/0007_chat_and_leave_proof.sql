CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`channel` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_message` ON `attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `channel_reads` (
	`email` text NOT NULL,
	`channel` text NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`email`, `channel`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`email` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`refs` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `messages_channel` ON `messages` (`channel`,`created_at`);--> statement-breakpoint
ALTER TABLE `leaves` ADD `proof_link` text;--> statement-breakpoint
ALTER TABLE `leaves` ADD `proof_photo` blob;