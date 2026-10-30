ALTER TABLE `popups` ADD `draft` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `popups` ADD `duration_min` integer;--> statement-breakpoint
ALTER TABLE `popups` ADD `ends_at` integer;
