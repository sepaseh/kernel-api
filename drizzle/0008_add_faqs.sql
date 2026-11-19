CREATE TABLE `faqs` (
	`answer` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`question` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `faqs_position_index` ON `faqs` (`position`);
