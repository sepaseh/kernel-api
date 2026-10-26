import type { Account } from "../contracts/account.ts";
import { permissionKeys } from "../contracts/permissions.ts";
import { profileNameMaxLength } from "../contracts/profile.ts";
import { ApplicationError } from "./errors.ts";
import type { Actor, UserRecord } from "./models.ts";
import type { AccountPersistence } from "./ports/account.ts";
import type { OtpGateway } from "./ports/auth.ts";
import { optionalString, requiredString } from "./validation.ts";

export const createAccountService = ({
  persistence,
  otp,
}: {
  persistence: AccountPersistence;
  otp: OtpGateway;
}) => {
  const serialize = async (user: UserRecord): Promise<Account> => ({
    ...(user.profileEmail && { email: user.profileEmail }),
    first_name: user.firstName,
    id: user.id,
    is_system_admin: user.isSystemAdmin,
    last_name: user.lastName,
    mobile: user.mobile,
    permissions: user.isSystemAdmin
      ? [...permissionKeys]
      : await persistence.getPermissions(user.id),
    status: user.status,
    ...(user.username && { username: user.username }),
  });

  return {
    getAccount: (actor: Actor) => serialize(actor.account),
    async requestEmailVerification(
      actor: Actor,
      input: Record<string, unknown>,
    ) {
      const email = requiredString(input.email, "email").toLowerCase();
      if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email))
        throw new ApplicationError("invalid", "emailInvalid");
      return otp.issue(email, "verify_email", actor.account.id);
    },
    async updateProfile(actor: Actor, input: Record<string, unknown>) {
      const firstName = optionalString(
        input.first_name,
        "first_name",
        profileNameMaxLength,
      );
      const lastName = optionalString(
        input.last_name,
        "last_name",
        profileNameMaxLength,
      );
      if (!firstName && !lastName)
        throw new ApplicationError("invalid", "profileFieldsRequired");
      return serialize(
        await persistence.updateProfile(actor.account, { firstName, lastName }),
      );
    },
    async updateUsername(actor: Actor, input: Record<string, unknown>) {
      const username = requiredString(input.username, "username").toLowerCase();
      if (!/^[a-z0-9_.-]{3,30}$/.test(username))
        throw new ApplicationError("invalid", "usernameInvalid");
      return serialize(
        await persistence.updateUsername(actor.account.id, username),
      );
    },
    async verifyEmail(actor: Actor, input: Record<string, unknown>) {
      const email = requiredString(input.email, "email").toLowerCase();
      const value = requiredString(input.otp, "otp");
      await otp.consume(
        otp.prepare(email, "verify_email", value, actor.account.id),
      );
      await persistence.verifyEmail(actor.account.id, email);
    },
  };
};

export type AccountService = ReturnType<typeof createAccountService>;
