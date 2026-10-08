CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`by` text NOT NULL,
	`by_email` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_task` ON `comments` (`task_id`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`grp` text DEFAULT '' NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`admin_groups` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 999 NOT NULL,
	`photo` blob,
	`photo_v` integer DEFAULT 0 NOT NULL,
	`seen_at` integer,
	`ask_at` integer
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`k` text PRIMARY KEY NOT NULL,
	`v` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proofs` (
	`task_id` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subs` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`sub` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_email` ON `push_subs` (`email`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`start` text,
	`due` text,
	`days` text NOT NULL,
	`hot` integer DEFAULT false NOT NULL,
	`need_proof` integer DEFAULT true NOT NULL,
	`by_name` text,
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`exp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`start` text,
	`due` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`hot` integer DEFAULT false NOT NULL,
	`need_proof` integer DEFAULT true NOT NULL,
	`by` text DEFAULT 'owner' NOT NULL,
	`from_admin` text,
	`routine_id` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`done_at` integer,
	`returned_at` integer,
	`proof_link` text,
	`proof_at` integer,
	`has_photo` integer DEFAULT false NOT NULL,
	`report` text,
	`report_at` integer,
	`rem_due` integer DEFAULT false NOT NULL,
	`rem_late` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_email_date` ON `tasks` (`email`,`date`);--> statement-breakpoint
CREATE INDEX `tasks_date` ON `tasks` (`date`);