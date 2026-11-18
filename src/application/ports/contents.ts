import type { ContentCategory } from "../../contracts/content-categories.ts";
import type { ContentRequest } from "../../contracts/contents.ts";
import type { FileRecord } from "./files.ts";

export type ContentCoverImage = Pick<
  FileRecord,
  "bucket" | "contentType" | "id" | "objectKey" | "visibility"
>;

export type ContentFields = Pick<
  ContentRequest,
  "body" | "excerpt" | "title"
> & {
  contentCategoryId: string;
  coverImageId: string;
};

export type ContentRecord = Omit<
  ContentFields,
  "contentCategoryId" | "coverImageId"
> & {
  contentCategory: ContentCategory;
  coverImage: ContentCoverImage;
  id: string;
};

export type ContentQuery = {
  contentCategoryId?: string;
  offset: number;
  title?: string;
};

type ContentWriteResult =
  ContentRecord | "missing-category" | "missing-content" | "invalid-cover";

export type ContentsRepository = {
  find(id: string): Promise<ContentRecord | undefined>;
  list(query: ContentQuery): Promise<{ items: ContentRecord[]; total: number }>;
  remove(id: string): Promise<boolean>;
  save(
    id: string,
    fields: ContentFields,
    canUseCover: (coverImage: ContentCoverImage) => boolean,
    createdAt?: Date,
  ): Promise<ContentWriteResult>;
};
