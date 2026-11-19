import type {
  ContentCategory,
  ContentCategoryRequest,
} from "../../contracts/content-categories.ts";

export type ContentCategoriesRepository = {
  create(category: ContentCategory): Promise<ContentCategory>;
  deleteIfUnused(id: string): Promise<"deleted" | "missing" | "in-use">;
  find(id: string): Promise<ContentCategory | undefined>;
  list(): Promise<ContentCategory[]>;
  sort(ids: string[]): Promise<boolean>;
  update(
    id: string,
    category: ContentCategoryRequest,
  ): Promise<ContentCategory | undefined>;
};
