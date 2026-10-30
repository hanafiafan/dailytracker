CREATE TABLE `popups` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`blocks` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `popup_seen` (
	`popup_id` text NOT NULL,
	`email` text NOT NULL,
	PRIMARY KEY(`popup_id`, `email`),
	FOREIGN KEY (`popup_id`) REFERENCES `popups`(`id`) ON UPDATE no action ON DELETE cascade
);
