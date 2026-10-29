import type { TestContext } from "node:test";
import { inspect } from "node:util";

type CleanupAction = () => void | Promise<void>;

export const cleanupFixtureResources = async (
  closers: ReadonlyArray<CleanupAction>,
  remove: CleanupAction,
): Promise<void> => {
  const errors: unknown[] = [];
  for (const close of closers) {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await remove();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Fixture cleanup failed");
};

export const registerFixtureCleanup = (
  context: TestContext,
  closers: ReadonlyArray<CleanupAction>,
  remove: CleanupAction,
): void => {
  context.after(async () => {
    try {
      await cleanupFixtureResources(closers, remove);
    } catch (error) {
      context.diagnostic(inspect(error, { depth: 4 }));
      throw error;
    }
  });
};
