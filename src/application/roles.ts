import { ApplicationError } from "./errors.ts";
import type { PermissionKey } from "./models.ts";
import { isPermissionKey } from "./permissions.ts";
import type { RolesRepository } from "./ports/roles.ts";
import { requiredString } from "./validation.ts";

const parsePermissions = (value: unknown): PermissionKey[] => {
  if (!Array.isArray(value) || !value.every(isPermissionKey)) {
    throw new ApplicationError("invalid", "permissionsInvalid");
  }
  return [...new Set(value)];
};

export const createRolesService = (repository: RolesRepository) => {
  const get = async (id: string) => {
    const role = await repository.find(id);
    if (!role) throw new ApplicationError("not-found", "roleNotFound");
    return role;
  };

  return {
    create: async (input: Record<string, unknown>) => {
      const name = requiredString(input.name, "name");
      const permissions = parsePermissions(input.permissions);
      return repository.create({ id: crypto.randomUUID(), name, permissions });
    },
    get,
    list: () => repository.list(),
    remove: async (id: string) => {
      const result = await repository.deleteIfUnassigned(id);
      if (result === "missing")
        throw new ApplicationError("not-found", "roleNotFound");
      if (result === "assigned")
        throw new ApplicationError("conflict", "roleAssigned");
    },
    update: async (id: string, input: Record<string, unknown>) => {
      await get(id);
      const name = requiredString(input.name, "name");
      const permissions = parsePermissions(input.permissions);
      const result = await repository.update(id, { name, permissions });
      if (!result) throw new ApplicationError("not-found", "roleNotFound");
      return result;
    },
  };
};
