import { eq, sql } from "drizzle-orm";

import { ApplicationError } from "../../application/errors.ts";
import type { AccountPersistence } from "../../application/ports/account.ts";
import type { Database } from "../db/client.ts";
import { user } from "../db/schema.ts";
import { isUniqueConstraintError } from "./errors.ts";
import { getUserPermissions, mapUserRecord } from "./identity.ts";

const requireAccount = <T>(value: T | undefined): T => {
  if (value === undefined)
    throw new ApplicationError("unauthenticated", "authenticationRequired");
  return value;
};

export const createAccountPersistence = (
  database: Database,
): AccountPersistence => ({
  getPermissions: (userId) => getUserPermissions(database, userId),
  async updateProfile(current, { firstName, lastName }) {
    const [updated] = await database
      .update(user)
      .set({
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        name: sql`${firstName ?? user.firstName} || ' ' || ${lastName ?? user.lastName}`,
        updatedAt: new Date(),
      })
      .where(eq(user.id, current.id))
      .returning();
    return mapUserRecord(requireAccount(updated));
  },
  async updateUsername(userId, username) {
    try {
      const [updated] = await database
        .update(user)
        .set({ displayUsername: username, updatedAt: new Date(), username })
        .where(eq(user.id, userId))
        .returning();
      return mapUserRecord(requireAccount(updated));
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ApplicationError("invalid", "usernameInUse");
      throw error;
    }
  },
  async verifyEmail(userId, email) {
    try {
      const [updated] = await database
        .update(user)
        .set({ profileEmail: email, updatedAt: new Date() })
        .where(eq(user.id, userId))
        .returning({ id: user.id });
      requireAccount(updated);
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ApplicationError("invalid", "emailInUse");
      throw error;
    }
  },
});
