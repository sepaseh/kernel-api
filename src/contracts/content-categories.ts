export type ContentCategory = {
  id: string;
  name: string;
};

export type ContentCategoryRequest = Pick<ContentCategory, "name">;

export type ContentCategorySortRequest = { ids: ContentCategory["id"][] };
