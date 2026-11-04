ALTER TABLE `tasks` ADD `due_date` text;--> statement-breakpoint
CREATE INDEX `tasks_due_date` ON `tasks` (`due_date`);