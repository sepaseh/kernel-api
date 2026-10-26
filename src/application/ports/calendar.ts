export type CalendarRepository = {
  add(date: string): Promise<void>;
  list(): Promise<string[]>;
  remove(date: string): Promise<boolean>;
};
