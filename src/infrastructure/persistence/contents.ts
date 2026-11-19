import { and, asc, count, eq, sql } from "drizzle-orm";

import type { ContentsRepository } from "../../application/ports/contents.ts";
import { contentsPageSize } from "../../contracts/contents.ts";
import type { Database } from "../db/client.ts";
import { contentCategories, contents, files } from "../db/schema.ts";

const categoryColumns = {
  id: contentCategories.id,
  name: contentCategories.name,
};

const coverImageColumns = {
  bucket: files.bucket,
  contentType: files.contentType,
  id: files.id,
  objectKey: files.objectKey,
  visibility: files.visibility,
};

export const createDrizzleContentsRepository = (
  database: Database,
): ContentsRepository => {
  const selectRecords = () =>
    database
      .select({
        body: contents.body,
        contentCategory: categoryColumns,
        coverImage: coverImageColumns,
        excerpt: contents.excerpt,
        id: contents.id,
        title: contents.title,
      })
      .from(contents)
      .innerJoin(
        contentCategories,
        eq(contents.contentCategoryId, contentCategories.id),
      )
      .innerJoin(files, eq(contents.coverImageId, files.id));

  return {
    find: async (id) => {
      const [record] = await selectRecords().where(eq(contents.id, id));
      return record;
    },
    list: async ({ contentCategoryId, offset, title }) => {
      const where = and(
        contentCategoryId
          ? eq(contents.contentCategoryId, contentCategoryId)
          : undefined,
        title
          ? sql`instr(${contents.normalizedTitle}, ${title.toLowerCase()}) > 0`
          : undefined,
      );
      const [items, total] = await database.batch([
        selectRecords()
          .where(where)
          .orderBy(asc(contents.createdAt), asc(contents.id))
          .limit(contentsPageSize)
          .offset(offset),
        database.select({ total: count() }).from(contents).where(where),
      ]);
      return { items, total: total[0].total };
    },
    remove: async (id) => {
      const [deleted] = await database
        .delete(contents)
        .where(eq(contents.id, id))
        .returning({ id: contents.id });
      return Boolean(deleted);
    },
    save: (id, fields, canUseCover, createdAt) =>
      database.transaction(async (transaction) => {
        if (!createdAt) {
          const existing = await transaction.query.contents.findFirst({
            columns: { id: true },
            where: eq(contents.id, id),
          });
          if (!existing) return "missing-content";
        }

        const [contentCategory] = await transaction
          .select(categoryColumns)
          .from(contentCategories)
          .where(eq(contentCategories.id, fields.contentCategoryId));
        if (!contentCategory) return "missing-category";

        const [coverImage] = await transaction
          .select(coverImageColumns)
          .from(files)
          .where(eq(files.id, fields.coverImageId));
        if (!coverImage || !canUseCover(coverImage)) return "invalid-cover";

        const { body, excerpt, title } = fields;
        const values = { ...fields, normalizedTitle: title.toLowerCase() };
        if (createdAt)
          await transaction
            .insert(contents)
            .values({ ...values, createdAt, id });
        else
          await transaction
            .update(contents)
            .set(values)
            .where(eq(contents.id, id));
        return { body, contentCategory, coverImage, excerpt, id, title };
      }),
  };
};
