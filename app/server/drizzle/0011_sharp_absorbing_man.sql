CREATE TABLE `guide_acks` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`version` integer NOT NULL,
	`at` integer NOT NULL
);
