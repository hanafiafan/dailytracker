CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT 'lilac' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_services` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `members` ADD `jobdesk` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `level` text DEFAULT 'Staff' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `account_type` text DEFAULT 'employee' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `can_create_project` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `can_comment_all_projects` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `allowed_comment_project_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `service_id` text REFERENCES project_services(id);