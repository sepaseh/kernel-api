import { asc, eq } from "drizzle-orm";

import { ApplicationError } from "../../application/errors.ts";
import { isPermissionKey } from "../../application/permissions.ts";
import type {
  RoleRecord,
  RolesRepository,
} from "../../application/ports/roles.ts";
import type { Database } from "../db/client.ts";
import { rolePermissions, roles, userRoles } from "../db/schema.ts";
import {
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from "./errors.ts";

const mapNameConflict = (error: unknown): never => {
  if (isUniqueConstraintError(error))
    throw new ApplicationError("invalid", "roleNameInUse");
  throw error;
};

const comparePermissionKeys = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export const createDrizzleRolesRepository = (
  database: Database,
): RolesRepository => {
  const list = async (): Promise<RoleRecord[]> => {
    const values = await database
      .select({
        id: roles.id,
        name: roles.name,
        permission: rolePermissions.permission,
      })
      .from(roles)
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .orderBy(asc(roles.name), asc(rolePermissions.permission));
    const result = new Map<string, RoleRecord>();
    for (const value of values) {
      const role: RoleRecord = result.get(value.id) ?? {
        id: value.id,
        name: value.name,
        permissions: [],
      };
      if (isPermissionKey(value.permission))
        role.permissions.push(value.permission);
      result.set(value.id, role);
    }
    return [...result.values()];
  };

  const find = async (id: string): Promise<RoleRecord | undefined> => {
    const role = await database.query.roles.findFirst({
      where: eq(roles.id, id),
    });
    if (!role) return undefined;
    const permissions = await database
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id))
      .orderBy(asc(rolePermissions.permission));
    return {
      id: role.id,
      name: role.name,
      permissions: permissions
        .map(({ permission }) => permission)
        .filter(isPermissionKey),
    };
  };

  return {
    create: async (role) => {
      try {
        await database.transaction(async (transaction) => {
          await transaction
            .insert(roles)
            .values({ id: role.id, name: role.name });
          if (role.permissions.length)
            await transaction.insert(rolePermissions).values(
              role.permissions.map((permission) => ({
                permission,
                roleId: role.id,
              })),
            );
        });
      } catch (error) {
        mapNameConflict(error);
      }
      return {
        ...role,
        permissions: [...role.permissions].sort(comparePermissionKeys),
      };
    },
    deleteIfUnassigned: async (id) => {
      try {
        return await database.transaction<"deleted" | "missing" | "assigned">(
          async (transaction) => {
            const role = await transaction.query.roles.findFirst({
              where: eq(roles.id, id),
            });
            if (!role) return "missing";
            const assignment = await transaction.query.userRoles.findFirst({
              where: eq(userRoles.roleId, id),
            });
            if (assignment) return "assigned";
            await transaction.delete(roles).where(eq(roles.id, id));
            return "deleted";
          },
        );
      } catch (error) {
        if (isForeignKeyConstraintError(error)) return "assigned";
        throw error;
      }
    },
    find,
    list,
    update: async (id, role) => {
      try {
        const saved = await database.transaction(async (transaction) => {
          const updated = await transaction
            .update(roles)
            .set({ name: role.name })
            .where(eq(roles.id, id))
            .returning({ id: roles.id });
          if (!updated.length) return false;
          await transaction
            .delete(rolePermissions)
            .where(eq(rolePermissions.roleId, id));
          if (role.permissions.length)
            await transaction.insert(rolePermissions).values(
              role.permissions.map((permission) => ({
                permission,
                roleId: id,
              })),
            );
          return true;
        });
        return saved
          ? {
              id,
              name: role.name,
              permissions: [...role.permissions].sort(comparePermissionKeys),
            }
          : undefined;
      } catch (error) {
        mapNameConflict(error);
      }
    },
  };
};
