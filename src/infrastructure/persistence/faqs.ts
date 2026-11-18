import { asc, eq, sql } from "drizzle-orm";

import type { FaqsRepository } from "../../application/ports/faqs.ts";
import type { Database } from "../db/client.ts";
import { faqs } from "../db/schema.ts";

const fields = { answer: faqs.answer, id: faqs.id, question: faqs.question };

export const createDrizzleFaqsRepository = (
  database: Database,
): FaqsRepository => ({
  create: async (faq) => {
    await database.insert(faqs).values({
      ...faq,
      position: sql<number>`(select coalesce(max(${faqs.position}), 0) + 1 from ${faqs})`,
    });
  },
  find: async (id) => {
    const [faq] = await database
      .select(fields)
      .from(faqs)
      .where(eq(faqs.id, id));
    return faq;
  },
  list: () => database.select(fields).from(faqs).orderBy(asc(faqs.position)),
  remove: async (id) => {
    const rows = await database
      .delete(faqs)
      .where(eq(faqs.id, id))
      .returning({ id: faqs.id });
    return rows.length > 0;
  },
  sort: async (ids) =>
    database.transaction(async (transaction) => {
      const rows = await transaction.select({ id: faqs.id }).from(faqs);
      const currentIds = new Set(rows.map(({ id }) => id));
      if (
        currentIds.size !== ids.length ||
        ids.some((id) => !currentIds.has(id))
      )
        return false;

      for (const [position, id] of ids.entries())
        await transaction
          .update(faqs)
          .set({ position: position + 1 })
          .where(eq(faqs.id, id));
      return true;
    }),
  update: async (id, faq) => {
    const [saved] = await database
      .update(faqs)
      .set(faq)
      .where(eq(faqs.id, id))
      .returning(fields);
    return saved;
  },
});
