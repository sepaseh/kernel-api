import type { OtpPurpose } from "../contracts/otp.ts";
import { permissionKeys } from "../contracts/permissions.ts";
import { profileNameMaxLength } from "../contracts/profile.ts";
import { authorizeActor } from "./authorization.ts";
import { ApplicationError } from "./errors.ts";
import { internalEmail } from "./identity.ts";
import type { Actor } from "./models.ts";
import {
  type AuthenticationOptions,
  type AuthPersistence,
  type AuthProvider,
  AuthRejection,
  type OtpGateway,
} from "./ports/auth.ts";
import { requiredString } from "./validation.ts";

const isMobile = (value: string) => /^09\d{9}$/.test(value);
const isOtpPurpose = (value: unknown): value is OtpPurpose =>
  value === "forgot_password" ||
  value === "login" ||
  value === "register" ||
  value === "verify_email";

export const createAuthService = ({
  provider,
  persistence,
  otp,
}: {
  provider: AuthProvider;
  persistence: AuthPersistence;
  otp: OtpGateway;
}) => {
  const validPasswordLength = async (password: string) => {
    const bounds = await provider.passwordBounds();
    return password.length >= bounds.min && password.length <= bounds.max;
  };

  const authenticate = async (
    options: AuthenticationOptions = {},
  ): Promise<Actor> => {
    const current = await provider.getSession();
    if (!current)
      throw new ApplicationError("unauthenticated", "authenticationRequired");
    const account = await persistence.findUserById(current.userId);
    if (!account || account.status !== "active")
      throw new ApplicationError("unauthenticated", "authenticationRequired");
    const permissions = account.isSystemAdmin
      ? [...permissionKeys]
      : await persistence.getPermissions(account.id);
    const actor = { account, permissions, session: current.session };
    authorizeActor(actor, options);
    return actor;
  };

  return {
    authenticate,
    async changePassword(actor: Actor, input: Record<string, unknown>) {
      const currentPassword = requiredString(
        input.current_password,
        "current_password",
      );
      const newPassword = requiredString(input.new_password, "new_password");
      if (currentPassword === newPassword)
        throw new ApplicationError("invalid", "newPasswordDifferent");
      if (!(await validPasswordLength(newPassword)))
        throw new ApplicationError("invalid", "passwordChangeInvalid");
      const credential = await persistence.findCredential(actor.account.id);
      if (
        !credential ||
        !(await provider.verifyPassword(currentPassword, credential.hash))
      )
        throw new ApplicationError("invalid", "passwordChangeInvalid");
      const newHash = await provider.hashPassword(newPassword);
      await persistence.changePassword({
        actor,
        credentialId: credential.id,
        expectedHash: credential.hash,
        newHash,
      });
      await provider.signOut();
    },
    async forgotPassword(input: Record<string, unknown>) {
      const mobile = requiredString(input.mobile, "mobile");
      const value = requiredString(input.otp, "otp");
      const password = requiredString(input.password, "password");
      if (!(await validPasswordLength(password)))
        throw new ApplicationError("invalid", "passwordResetInvalid");
      const existing = await persistence.findUserByMobile(mobile);
      if (!existing)
        throw new ApplicationError("invalid", "passwordResetInvalid");
      await persistence.resetPasswordWithOtp({
        newHash: await provider.hashPassword(password),
        otp: otp.prepare(mobile, "forgot_password", value),
        userId: existing.id,
      });
    },
    async login(input: Record<string, unknown>) {
      const identifier = requiredString(input.identifier, "identifier");
      const password = requiredString(input.password, "password");
      if (!isMobile(identifier))
        throw new ApplicationError("invalid", "invalidCredentials");
      const existing = await persistence.findUserByMobile(identifier);
      if (!existing || existing.status !== "active")
        throw new ApplicationError("invalid", "invalidCredentials");
      try {
        return await provider.signIn(existing.authEmail, password);
      } catch (error) {
        if (error instanceof AuthRejection)
          throw new ApplicationError("invalid", "invalidCredentials");
        throw error;
      }
    },
    async logout() {
      const current = await provider.getSession();
      if (current) await persistence.deleteSession(current.session.id);
      await provider.signOut();
    },
    async register(input: Record<string, unknown>) {
      const firstName = requiredString(
        input.first_name,
        "first_name",
        profileNameMaxLength,
      );
      const lastName = requiredString(
        input.last_name,
        "last_name",
        profileNameMaxLength,
      );
      const mobile = requiredString(input.mobile, "mobile");
      const value = requiredString(input.otp, "otp");
      const password = requiredString(input.password, "password");
      if (!isMobile(mobile))
        throw new ApplicationError("invalid", "mobileInvalid");
      if (!(await validPasswordLength(password)))
        throw new ApplicationError("invalid", "registrationInvalid");
      await otp.consume(otp.prepare(mobile, "register", value));
      try {
        return await provider.signUp({
          authEmail: internalEmail(mobile),
          firstName,
          lastName,
          mobile,
          name: `${firstName} ${lastName}`,
          password,
        });
      } catch (error) {
        if (error instanceof AuthRejection)
          throw new ApplicationError("invalid", "registrationInvalid");
        throw error;
      }
    },
    async requestOtp(input: Record<string, unknown>) {
      const mobile = requiredString(input.mobile, "mobile");
      if (!isMobile(mobile) || !isOtpPurpose(input.purpose))
        throw new ApplicationError("invalid", "invalidMobileOrPurpose");
      return otp.issue(mobile, input.purpose);
    },
  };
};

export type AuthService = ReturnType<typeof createAuthService>;
