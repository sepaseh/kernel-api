import type { ContentCategorySortRequest } from "../contracts/content-categories.ts";
import { ApplicationError } from "./errors.ts";
import type { Actor, PermissionKey } from "./models.ts";
import type { ContentCategoriesRepository } from "./ports/content-categories.ts";
import { requiredString } from "./validation.ts";

const listPermissions: PermissionKey[] = [
  "content-categories.read",
  "contents.create",
  "contents.read",
  "contents.update",
];

const parseIds = (value: unknown): ContentCategorySortRequest["ids"] => {
  if (
    !Array.isArray(value) ||
    !value.every((id): id is string => typeof id === "string" && !!id.trim()) ||
    new Set(value).size !== value.length
  )
    throw new ApplicationError("invalid", "contentCategoryOrderInvalid");
  return value;
};

export const createContentCategoriesService = (
  repository: ContentCategoriesRepository,
) => ({
  create: (input: Record<string, unknown>) =>
    repository.create({
      id: crypto.randomUUID(),
      name: requiredString(input.name, "name"),
    }),
  get: async (id: string) => {
    const category = await repository.find(id);
    if (!category)
      throw new ApplicationError("not-found", "contentCategoryNotFound");
    return category;
  },
  list: (actor: Actor) => {
    if (
      !listPermissions.some((permission) =>
        actor.permissions.includes(permission),
      )
    )
      throw new ApplicationError("forbidden", "permissionDenied");
    return repository.list();
  },
  remove: async (id: string) => {
    const result = await repository.deleteIfUnused(id);
    if (result === "missing")
      throw new ApplicationError("not-found", "contentCategoryNotFound");
    if (result === "in-use")
      throw new ApplicationError("conflict", "contentCategoryInUse");
  },
  sort: async (input: Record<string, unknown>) => {
    const ids = parseIds(input.ids);
    if (!(await repository.sort(ids)))
      throw new ApplicationError("conflict", "contentCategoryOrderInvalid");
  },
  update: async (id: string, input: Record<string, unknown>) => {
    const name = requiredString(input.name, "name");
    const category = await repository.update(id, { name });
    if (!category)
      throw new ApplicationError("not-found", "contentCategoryNotFound");
    return category;
  },
});
