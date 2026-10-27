import { asc, eq } from "drizzle-orm";

import type { CalendarRepository } from "../../application/ports/calendar.ts";
import type { Database } from "../db/client.ts";
import { calendarDates } from "../db/schema.ts";

export const createDrizzleCalendarRepository = (
  database: Database,
): CalendarRepository => ({
  add: async (date) => {
    await database.insert(calendarDates).values({ date }).onConflictDoNothing();
  },
  list: async () => {
    const values = await database
      .select()
      .from(calendarDates)
      .orderBy(asc(calendarDates.date));
    return values.map(({ date }) => date);
  },
  remove: async (date) => {
    const values = await database
      .delete(calendarDates)
      .where(eq(calendarDates.date, date))
      .returning();
    return values.length > 0;
  },
});
