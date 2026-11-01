import { and, eq } from "drizzle-orm";

import { ApplicationError } from "../../application/errors.ts";
import type { AuthPersistence } from "../../application/ports/auth.ts";
import { consumeOtpAttempt } from "../auth/otp.ts";
import type { Database } from "../db/client.ts";
import { account, session, user } from "../db/schema.ts";
import { getUserPermissions, mapUserRecord } from "./identity.ts";

export const createAuthPersistence = (database: Database): AuthPersistence => ({
  async changePassword({ actor, credentialId, expectedHash, newHash }) {
    await database.transaction(async (transaction) => {
      const activeSession = await transaction.query.session.findFirst({
        where: eq(session.id, actor.session.id),
      });
      const activeUser = await transaction.query.user.findFirst({
        where: eq(user.id, actor.account.id),
      });
      if (
        !activeSession ||
        activeSession.expiresAt <= new Date() ||
        activeSession.userId !== actor.account.id ||
        activeUser?.status !== "active"
      )
        throw new ApplicationError("unauthenticated", "authenticationRequired");
      const updated = await transaction
        .update(account)
        .set({ password: newHash, updatedAt: new Date() })
        .where(
          and(
            eq(account.id, credentialId),
            eq(account.userId, actor.account.id),
            eq(account.providerId, "credential"),
            eq(account.password, expectedHash),
          ),
        )
        .returning({ id: account.id });
      if (!updated.length)
        throw new ApplicationError("invalid", "passwordChangeInvalid");
      await transaction
        .delete(session)
        .where(eq(session.userId, actor.account.id));
    });
  },
  async deleteSession(id) {
    await database.delete(session).where(eq(session.id, id));
  },
  async findCredential(userId) {
    const credential = await database.query.account.findFirst({
      where: and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
      ),
    });
    return credential?.password
      ? { hash: credential.password, id: credential.id }
      : undefined;
  },
  async findUserById(id) {
    const record = await database.query.user.findFirst({
      where: eq(user.id, id),
    });
    return record ? mapUserRecord(record) : undefined;
  },
  async findUserByMobile(mobile) {
    const record = await database.query.user.findFirst({
      where: eq(user.mobile, mobile),
    });
    return record ? mapUserRecord(record) : undefined;
  },
  getPermissions: (userId) => getUserPermissions(database, userId),
  async resetPasswordWithOtp({ userId, newHash, otp }) {
    await database.transaction(async (transaction) => {
      const currentUser = await transaction.query.user.findFirst({
        where: and(eq(user.id, userId), eq(user.mobile, otp.destination)),
      });
      if (!currentUser || otp.purpose !== "forgot_password" || otp.subject)
        throw new ApplicationError("invalid", "passwordResetInvalid");
      await consumeOtpAttempt(transaction, otp);
      const result = await transaction
        .update(account)
        .set({ password: newHash, updatedAt: new Date() })
        .where(
          and(eq(account.userId, userId), eq(account.providerId, "credential")),
        )
        .returning({ id: account.id });
      if (!result.length)
        throw new ApplicationError("invalid", "passwordResetInvalid");
      await transaction.delete(session).where(eq(session.userId, userId));
    });
  },
});
