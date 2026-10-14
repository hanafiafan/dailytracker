ALTER TABLE `chat_groups` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_groups` ADD `photo` blob;--> statement-breakpoint
ALTER TABLE `chat_groups` ADD `photo_v` integer DEFAULT 0 NOT NULL;
