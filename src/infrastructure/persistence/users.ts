import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";

import { ApplicationError } from "../../application/errors.ts";
import type {
  UsersRepository,
  UsersWritePort,
} from "../../application/ports/users.ts";
import { consumeOtpAttempt } from "../auth/otp.ts";
import type { Database } from "../db/client.ts";
import {
  account,
  files,
  rolePermissions,
  roles,
  session,
  user,
  userRoles,
} from "../db/schema.ts";
import {
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from "./errors.ts";
import { getRolesByUserIds, mapUserRecord } from "./identity.ts";

type WriteExecutor = Pick<
  Database,
  "query" | "select" | "update" | "delete" | "insert"
>;

const writePort = (database: WriteExecutor): UsersWritePort => ({
  async consumeOtp(attempt) {
    await consumeOtpAttempt(database, attempt);
  },
  async countActiveAdmins() {
    const [value] = await database
      .select({ total: count() })
      .from(user)
      .where(and(eq(user.isSystemAdmin, true), eq(user.status, "active")));
    return value?.total ?? 0;
  },
  async deleteSessions(userId) {
    await database.delete(session).where(eq(session.userId, userId));
  },
  async existingRoleIds(ids) {
    if (!ids.length) return [];
    const values = await database
      .select({ id: roles.id })
      .from(roles)
      .where(inArray(roles.id, ids));
    return values.map(({ id }) => id);
  },
  async find(id) {
    const value = await database.query.user.findFirst({
      where: eq(user.id, id),
    });
    return value ? mapUserRecord(value) : undefined;
  },
  async hasActiveSession(sessionId, userId) {
    const value = await database.query.session.findFirst({
      where: and(eq(session.id, sessionId), eq(session.userId, userId)),
    });
    return !!value && value.expiresAt > new Date();
  },
  async hasPermission(userId, permission) {
    const rows = await database
      .select({ permission: rolePermissions.permission })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(rolePermissions.permission, permission),
        ),
      )
      .limit(1);
    return rows.length > 0;
  },
  async remove(id) {
    const uploadedFile = await database
      .select({ id: files.id })
      .from(files)
      .where(eq(files.createdBy, id))
      .limit(1);
    if (uploadedFile.length) return "in-use";
    const assignment = await database
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, id))
      .limit(1);
    if (assignment.length) return "in-use";

    try {
      await database.delete(user).where(eq(user.id, id));
      return "deleted";
    } catch (error) {
      if (isForeignKeyConstraintError(error)) return "in-use";
      throw error;
    }
  },
  async replaceRoles(userId, roleIds) {
    await database.delete(userRoles).where(eq(userRoles.userId, userId));
    if (roleIds.length)
      await database
        .insert(userRoles)
        .values(roleIds.map((roleId) => ({ roleId, userId })));
  },
  async resetCredentialPassword(userId, hash) {
    const changed = await database
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "credential")),
      )
      .returning({ id: account.id });
    if (!changed.length) return false;
    return true;
  },
  async setStatus(id, status) {
    await database
      .update(user)
      .set({ status, updatedAt: new Date() })
      .where(eq(user.id, id));
  },
  async setSystemAdmin(id, isSystemAdmin) {
    await database
      .update(user)
      .set({ isSystemAdmin, updatedAt: new Date() })
      .where(eq(user.id, id));
  },
  async update(id, update, actorId) {
    try {
      if (typeof actorId !== "string" || !actorId)
        throw new ApplicationError("forbidden", "systemAdminRequired");
      const where = update.mobile
        ? and(
            eq(user.id, id),
            or(
              eq(user.mobile, update.mobile),
              and(eq(user.id, actorId), eq(user.status, "active")),
              sql`EXISTS (SELECT 1 FROM user AS acting_user WHERE acting_user.id = ${actorId} AND acting_user.is_system_admin = 1 AND acting_user.status = 'active')`,
            ),
          )
        : eq(user.id, id);
      const [value] = await database
        .update(user)
        .set({
          ...update,
          name: sql`${update.firstName ?? user.firstName} || ' ' || ${update.lastName ?? user.lastName}`,
          updatedAt: new Date(),
        })
        .where(where)
        .returning();
      if (!value && update.mobile && (await writePort(database).find(id)))
        throw new ApplicationError("forbidden", "systemAdminRequired");
      return value ? mapUserRecord(value) : undefined;
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ApplicationError("invalid", "mobileInUse");
      throw error;
    }
  },
});

export const createDrizzleUsersRepository = (
  database: Database,
): UsersRepository => ({
  async deleteSessions(userId) {
    await database.delete(session).where(eq(session.userId, userId));
  },
  find: writePort(database).find,
  getRoles: (userIds) => getRolesByUserIds(database, userIds),
  async list(query) {
    const conditions = [];
    if (query.email) conditions.push(eq(user.profileEmail, query.email));
    if (query.mobile) conditions.push(eq(user.mobile, query.mobile));
    if (query.username) conditions.push(eq(user.username, query.username));
    if (query.firstName)
      conditions.push(like(user.firstName, `%${query.firstName}%`));
    if (query.lastName)
      conditions.push(like(user.lastName, `%${query.lastName}%`));
    if (query.status) conditions.push(eq(user.status, query.status));
    const where = conditions.length ? and(...conditions) : undefined;
    const [page, totals] = await Promise.all([
      database
        .select()
        .from(user)
        .where(where)
        .orderBy(asc(user.createdAt))
        .limit(query.size)
        .offset(query.offset),
      database.select({ total: count() }).from(user).where(where),
    ]);
    return { items: page.map(mapUserRecord), total: totals[0]?.total ?? 0 };
  },
  transaction: (work) =>
    database.transaction((transaction) => work(writePort(transaction))),
  update: writePort(database).update,
});
