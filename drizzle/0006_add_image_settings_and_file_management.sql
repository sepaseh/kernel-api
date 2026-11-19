CREATE TABLE `pending_file_deletions` (
	`bucket` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `settings` ADD `image_settings` text DEFAULT '{"contents":{"height":630,"size":2000000,"width":1200},"logo":{"height":256,"size":1000000,"width":256}}' NOT NULL;
