import type { Content, ContentsResponse } from "../contracts/contents.ts";
import {
  contentsPageSize,
  isContentCoverImageType,
} from "../contracts/contents.ts";
import { ApplicationError } from "./errors.ts";
import type {
  ContentCoverImage,
  ContentFields,
  ContentRecord,
  ContentsRepository,
} from "./ports/contents.ts";
import { requiredString } from "./validation.ts";

const maxContentFieldLength = 64 * 1024;

const contentOffset = (page: string | undefined) => {
  const parsed = Number.parseInt(page ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.min((parsed - 1) * contentsPageSize, Number.MAX_SAFE_INTEGER);
};

export const createContentsService = (
  repository: ContentsRepository,
  coverImageUrl: (image: ContentCoverImage) => string | undefined,
  normalizeBody: (html: string) => string | undefined,
) => {
  const publicImage = (image: ContentCoverImage) => {
    if (
      image.visibility !== "public" ||
      !isContentCoverImageType(image.contentType)
    )
      return undefined;

    const url = coverImageUrl(image);
    return url ? { id: image.id, url } : undefined;
  };

  const serialize = (record: ContentRecord): Content => {
    const coverImage = publicImage(record.coverImage);
    if (!coverImage) throw new Error("Content cover lacks a public image URL.");

    return {
      body: record.body,
      content_category: record.contentCategory,
      cover_image: coverImage,
      excerpt: record.excerpt,
      id: record.id,
      title: record.title,
    };
  };

  const readFields = (input: Record<string, unknown>): ContentFields => {
    const title = requiredString(input.title, "title", maxContentFieldLength);
    const excerpt = requiredString(
      input.excerpt,
      "excerpt",
      maxContentFieldLength,
    );
    const body = normalizeBody(
      requiredString(input.body, "body", maxContentFieldLength),
    );
    if (!body)
      throw new ApplicationError("invalid", "fieldRequired", { field: "body" });

    return {
      body,
      contentCategoryId: requiredString(
        input.content_category_id,
        "content_category_id",
      ),
      coverImageId: requiredString(input.cover_image_id, "cover_image_id"),
      excerpt,
      title,
    };
  };

  const save = async (
    id: string,
    input: Record<string, unknown>,
    createdAt?: Date,
  ) => {
    const record = await repository.save(
      id,
      readFields(input),
      (image) => Boolean(publicImage(image)),
      createdAt,
    );
    if (record === "missing-content")
      throw new ApplicationError("not-found", "contentNotFound");
    if (record === "missing-category")
      throw new ApplicationError("not-found", "contentCategoryNotFound");
    if (record === "invalid-cover")
      throw new ApplicationError("not-found", "contentCoverImageNotFound");

    return serialize(record);
  };

  return {
    create: (input: Record<string, unknown>) =>
      save(crypto.randomUUID(), input, new Date()),
    get: async (id: string) => {
      const record = await repository.find(id);
      if (!record) throw new ApplicationError("not-found", "contentNotFound");
      return serialize(record);
    },
    list: async (
      query: Record<string, string | undefined>,
    ): Promise<ContentsResponse> => {
      const { items, total } = await repository.list({
        contentCategoryId: query.content_category_id,
        offset: contentOffset(query.page),
        title: query.title,
      });
      return { items: items.map(serialize), total };
    },
    remove: async (id: string) => {
      if (!(await repository.remove(id)))
        throw new ApplicationError("not-found", "contentNotFound");
    },
    update: (id: string, input: Record<string, unknown>) => save(id, input),
  };
};

export type ContentsService = ReturnType<typeof createContentsService>;
