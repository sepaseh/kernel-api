import { ApplicationError } from "./errors.ts";
import type { CalendarRepository } from "./ports/calendar.ts";
import { requiredString } from "./validation.ts";

const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
  );
};

export const createCalendarService = (repository: CalendarRepository) => ({
  add: async (input: Record<string, unknown>) => {
    const date = requiredString(input.date, "date");
    if (!isDate(date))
      throw new ApplicationError("invalid", "calendarDateFormat");
    await repository.add(date);
  },
  list: () => repository.list(),
  remove: async (date: string) => {
    if (!(await repository.remove(date)))
      throw new ApplicationError("not-found", "calendarDateNotFound");
  },
});
