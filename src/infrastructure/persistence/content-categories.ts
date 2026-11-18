import { asc, eq, sql } from "drizzle-orm";

import type { ContentCategoriesRepository } from "../../application/ports/content-categories.ts";
import type { Database } from "../db/client.ts";
import { contentCategories, contents } from "../db/schema.ts";
import { isForeignKeyConstraintError } from "./errors.ts";

const categoryFields = {
  id: contentCategories.id,
  name: contentCategories.name,
};

export const createDrizzleContentCategoriesRepository = (
  database: Database,
): ContentCategoriesRepository => ({
  create: async (category) => {
    await database.insert(contentCategories).values({
      ...category,
      position: sql<number>`(select coalesce(max(${contentCategories.position}), -1) + 1 from ${contentCategories})`,
    });
    return category;
  },
  deleteIfUnused: async (id) => {
    try {
      return await database.transaction(async (transaction) => {
        const category = await transaction.query.contentCategories.findFirst({
          columns: { id: true },
          where: eq(contentCategories.id, id),
        });
        if (!category) return "missing";
        const reference = await transaction.query.contents.findFirst({
          columns: { id: true },
          where: eq(contents.contentCategoryId, id),
        });
        if (reference) return "in-use";
        await transaction
          .delete(contentCategories)
          .where(eq(contentCategories.id, id));
        return "deleted";
      });
    } catch (error) {
      if (isForeignKeyConstraintError(error)) return "in-use";
      throw error;
    }
  },
  find: (id) =>
    database.query.contentCategories.findFirst({
      columns: { id: true, name: true },
      where: eq(contentCategories.id, id),
    }),
  list: () =>
    database
      .select(categoryFields)
      .from(contentCategories)
      .orderBy(asc(contentCategories.position), asc(contentCategories.id)),
  sort: (ids) =>
    database.transaction(async (transaction) => {
      const current = await transaction
        .select({ id: contentCategories.id })
        .from(contentCategories);
      const submitted = new Set(ids);
      if (
        ids.length !== current.length ||
        !current.every(({ id }) => submitted.has(id))
      )
        return false;

      for (const [position, id] of ids.entries())
        await transaction
          .update(contentCategories)
          .set({ position })
          .where(eq(contentCategories.id, id));
      return true;
    }),
  update: async (id, category) => {
    const [saved] = await database
      .update(contentCategories)
      .set(category)
      .where(eq(contentCategories.id, id))
      .returning(categoryFields);
    return saved;
  },
});
