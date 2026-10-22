ALTER TABLE `project_services` ADD `target_qty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_services` ADD `unit` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_services` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `project_services` ADD `pic_emails` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `client_email` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `pm_email` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `qty` integer DEFAULT 0 NOT NULL;
