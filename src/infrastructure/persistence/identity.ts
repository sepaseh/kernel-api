import { asc, eq, inArray } from "drizzle-orm";

import type { PermissionKey, UserRecord } from "../../application/models.ts";
import { isPermissionKey } from "../../application/permissions.ts";
import type { Database } from "../db/client.ts";
import type { user } from "../db/schema.ts";
import { rolePermissions, roles, userRoles } from "../db/schema.ts";
export const getUserPermissions = async (
  database: Database,
  userId: string,
): Promise<PermissionKey[]> => {
  const values = await database
    .select({ permission: rolePermissions.permission })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .where(eq(userRoles.userId, userId));

  return [...new Set(values.map(({ permission }) => permission))].filter(
    isPermissionKey,
  );
};

export const getRolesByUserIds = async (
  database: Database,
  userIds: string[],
) => {
  if (userIds.length === 0)
    return new Map<string, Array<{ id: string; name: string }>>();
  const values = await database
    .select({ id: roles.id, name: roles.name, userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, userIds))
    .orderBy(asc(roles.name));
  const result = new Map<string, Array<{ id: string; name: string }>>();
  for (const value of values) {
    const existing = result.get(value.userId) ?? [];
    existing.push({ id: value.id, name: value.name });
    result.set(value.userId, existing);
  }

  return result;
};

export const mapUserRecord = (value: typeof user.$inferSelect): UserRecord => ({
  id: value.id,
  authEmail: value.email,
  firstName: value.firstName,
  lastName: value.lastName,
  name: value.name,
  mobile: value.mobile,
  status: value.status,
  isSystemAdmin: value.isSystemAdmin,
  ...(value.profileEmail && { profileEmail: value.profileEmail }),
  ...(value.username && { username: value.username }),
});
