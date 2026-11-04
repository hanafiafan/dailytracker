ALTER TABLE `tasks` ADD `hold_reason` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `held_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `held_by` text;