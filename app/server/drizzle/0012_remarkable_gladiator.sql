ALTER TABLE `tasks` ADD `approval_status` text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `approved_by` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `approved_at` integer;