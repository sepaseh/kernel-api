CREATE TABLE `__new_settings` (
	`dark_logo_id` text,
	`dark_theme` text NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`language_code` text NOT NULL,
	`light_logo_id` text,
	`light_theme` text NOT NULL,
	FOREIGN KEY (`dark_logo_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`light_logo_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_settings`("dark_logo_id", "dark_theme", "id", "language_code", "light_logo_id", "light_theme") SELECT "dark_logo_id", "dark_theme", "id", "language_code", "light_logo_id", "light_theme" FROM `settings`;
--> statement-breakpoint
DROP TABLE `settings`;
--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;
