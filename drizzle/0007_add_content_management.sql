CREATE TABLE `content_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_categories_position_index` ON `content_categories` (`position`);
--> statement-breakpoint
CREATE TABLE `contents` (
	`body` text NOT NULL,
	`content_category_id` text NOT NULL,
	`cover_image_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`excerpt` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`normalized_title` text NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`content_category_id`) REFERENCES `content_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cover_image_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `contents_category_index` ON `contents` (`content_category_id`);
--> statement-breakpoint
CREATE INDEX `contents_cover_image_index` ON `contents` (`cover_image_id`);
