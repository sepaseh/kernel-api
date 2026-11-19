import type { ContentCategory } from "./content-categories.ts";

export type ContentRequest = {
  body: string;
  content_category_id: string;
  cover_image_id: string;
  excerpt: string;
  title: string;
};

export type Content = Pick<ContentRequest, "body" | "excerpt" | "title"> & {
  content_category: ContentCategory;
  cover_image: { id: string; url: string };
  id: string;
};

export type ContentsResponse = { items: Content[]; total: number };

export const contentsPageSize = 24;

const contentCoverImageTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const isContentCoverImageType = (contentType: string): boolean =>
  contentCoverImageTypes.has(contentType.toLowerCase());
