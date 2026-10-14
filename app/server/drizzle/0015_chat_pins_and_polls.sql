ALTER TABLE `messages` ADD `is_pinned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinned_at` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinned_by` text;--> statement-breakpoint
CREATE TABLE `chat_polls` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`channel` text NOT NULL,
	`creator_email` text NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`allow_multiple` integer DEFAULT 0 NOT NULL,
	`is_closed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `chat_poll_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_id` text NOT NULL,
	`email` text NOT NULL,
	`option_index` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `chat_polls`(`id`) ON UPDATE no action ON DELETE cascade
);
