import { profileNameMaxLength } from "../contracts/profile.ts";
import { ApplicationError } from "./errors.ts";
import { internalEmail } from "./identity.ts";
import type { Actor, UserRecord } from "./models.ts";
import {
  type AuthProvider,
  AuthRejection,
  type OtpGateway,
} from "./ports/auth.ts";
import type {
  UserRole,
  UsersRepository,
  UsersWritePort,
  UserUpdate,
} from "./ports/users.ts";
import { optionalString, requiredString } from "./validation.ts";

const serialize = (value: UserRecord, roles: UserRole[] = []) => ({
  ...(value.profileEmail && { email: value.profileEmail }),
  first_name: value.firstName,
  id: value.id,
  is_system_admin: value.isSystemAdmin,
  last_name: value.lastName,
  mobile: value.mobile,
  roles,
  status: value.status,
  ...(value.username && { username: value.username }),
});

const parsePagination = (value: string | undefined, fallback: number) => {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
};

export const createUsersService = ({
  provider,
  repository,
  otp,
}: {
  provider: AuthProvider;
  repository: UsersRepository;
  otp?: OtpGateway;
}) => {
  const find = async (
    id: string,
    source: Pick<UsersWritePort, "find"> = repository,
  ) => {
    const value = await source.find(id);
    if (!value) throw new ApplicationError("not-found", "userNotFound");
    return value;
  };
  const protectFinalAdmin = async (
    current: UserRecord,
    transaction: UsersWritePort,
  ) => {
    if (
      current.isSystemAdmin &&
      current.status === "active" &&
      (await transaction.countActiveAdmins()) <= 1
    )
      throw new ApplicationError("conflict", "finalAdminDelete");
  };
  const get = async (id: string) => {
    const current = await find(id);
    const roles = await repository.getRoles([id]);
    return serialize(current, roles.get(id) ?? []);
  };

  const mobileSubject = (
    actor: Actor,
    id: string,
    oldMobile: string,
    newMobile: string,
    mode: "profile" | "management",
  ) =>
    JSON.stringify([
      mode,
      actor.account.id,
      actor.session.id,
      id,
      oldMobile,
      newMobile,
    ]);
  const mobileContext = async (
    transaction: UsersWritePort,
    actor: Actor,
    id: string,
    mode: "profile" | "management",
    changingMobile = true,
  ) => {
    const current = await find(id, transaction);
    const liveActor = await transaction.find(actor.account.id);
    if (
      liveActor?.status !== "active" ||
      !(await transaction.hasActiveSession(actor.session.id, actor.account.id))
    )
      throw new ApplicationError("unauthenticated", "authenticationRequired");
    if (
      (mode === "profile" && id !== liveActor.id) ||
      (changingMobile && id !== liveActor.id && !liveActor.isSystemAdmin) ||
      (changingMobile && current.isSystemAdmin && !liveActor.isSystemAdmin)
    )
      throw new ApplicationError("forbidden", "systemAdminRequired");
    if (
      mode === "management" &&
      !liveActor.isSystemAdmin &&
      !(await transaction.hasPermission(liveActor.id, "users.update"))
    )
      throw new ApplicationError("forbidden", "permissionDenied");
    return current;
  };

  return {
    async requestMobileVerification(
      actor: Actor,
      id: string,
      input: Record<string, unknown>,
      mode: "profile" | "management" = "management",
    ) {
      const mobile = requiredString(input.mobile, "mobile");
      if (!/^09\d{9}$/.test(mobile))
        throw new ApplicationError("invalid", "mobileInvalid");
      if (!otp) throw new Error("Mobile verification is not configured.");
      const current = await repository.transaction((transaction) =>
        mobileContext(transaction, actor, id, mode),
      );
      if (current.mobile === mobile)
        throw new ApplicationError("invalid", "updateFieldsRequired");
      return otp.issue(
        mobile,
        "change_mobile",
        mobileSubject(actor, id, current.mobile, mobile, mode),
      );
    },
    async create(input: Record<string, unknown>) {
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
      const password = requiredString(input.password, "password");
      if (!/^09\d{9}$/.test(mobile))
        throw new ApplicationError("invalid", "mobileInvalid");
      try {
        const created = await provider.signUp({
          authEmail: internalEmail(mobile),
          firstName,
          lastName,
          mobile,
          name: `${firstName} ${lastName}`,
          password,
        });
        await repository.deleteSessions(created.userId);
        return serialize(await find(created.userId));
      } catch (error) {
        if (error instanceof AuthRejection)
          throw new ApplicationError("invalid", "userDataInvalid");
        throw error;
      }
    },
    get,
    async list(query: Record<string, string | undefined>) {
      const requestedSize = parsePagination(query.size, 12);
      const page = await repository.list({
        email: query.email,
        firstName: query.first_name,
        lastName: query.last_name,
        mobile: query.mobile,
        offset: parsePagination(query.offset, 0),
        size: requestedSize > 0 ? Math.min(requestedSize, 100) : 12,
        status:
          query.status === "active" || query.status === "inactive"
            ? query.status
            : undefined,
        username: query.username,
      });
      const roles = await repository.getRoles(page.items.map(({ id }) => id));
      return {
        items: page.items.map((value) =>
          serialize(value, roles.get(value.id) ?? []),
        ),
        total: page.total,
      };
    },
    async remove(actor: Actor, id: string) {
      await find(id);
      await repository.transaction(async (transaction) => {
        const current = await find(id, transaction);
        if (current.id === actor.account.id)
          throw new ApplicationError("conflict", "userCannotDeleteSelf");
        await protectFinalAdmin(current, transaction);
        if ((await transaction.remove(id)) === "in-use")
          throw new ApplicationError("conflict", "userInUse");
      });
    },
    async replaceRoles(id: string, input: Record<string, unknown>) {
      await find(id);
      if (
        !Array.isArray(input.role_ids) ||
        !input.role_ids.every((value) => typeof value === "string")
      )
        throw new ApplicationError("invalid", "userRolesInvalid");
      const roleIds = [...new Set(input.role_ids)];
      await repository.transaction(async (transaction) => {
        await find(id, transaction);
        if (
          roleIds.length &&
          (await transaction.existingRoleIds(roleIds)).length !== roleIds.length
        )
          throw new ApplicationError("not-found", "roleNotFound");
        await transaction.replaceRoles(id, roleIds);
      });
    },
    async resetPassword(id: string, input: Record<string, unknown>) {
      await find(id);
      const password = requiredString(input.password, "password");
      const bounds = await provider.passwordBounds();
      if (password.length < bounds.min)
        throw new ApplicationError("invalid", "passwordTooShort");
      if (password.length > bounds.max)
        throw new ApplicationError("invalid", "passwordResetInvalid");
      const hash = await provider.hashPassword(password);
      await repository.transaction(async (transaction) => {
        if (!(await transaction.resetCredentialPassword(id, hash)))
          throw new ApplicationError("not-found", "credentialAccountNotFound");
        await transaction.deleteSessions(id);
      });
    },
    async setStatus(actor: Actor, id: string, input: Record<string, unknown>) {
      await find(id);
      if (input.status !== "active" && input.status !== "inactive")
        throw new ApplicationError("invalid", "userStatusInvalid");
      const status = input.status;
      await repository.transaction(async (transaction) => {
        const current = await find(id, transaction);
        if (current.id === actor.account.id && status === "inactive")
          throw new ApplicationError("conflict", "userCannotDeactivateSelf");
        if (status === "inactive")
          await protectFinalAdmin(current, transaction);
        await transaction.setStatus(id, status);
      });
    },
    async setSystemAdmin(id: string, input: Record<string, unknown>) {
      await find(id);
      if (typeof input.is_system_admin !== "boolean")
        throw new ApplicationError("invalid", "systemAdminInvalid");
      const value = input.is_system_admin;
      await repository.transaction(async (transaction) => {
        const current = await find(id, transaction);
        if (!value) await protectFinalAdmin(current, transaction);
        await transaction.setSystemAdmin(id, value);
      });
    },
    async update(
      actor: Actor,
      id: string,
      input: Record<string, unknown>,
      mode: "profile" | "management" = "management",
    ) {
      await find(id);
      const changes: UserUpdate = {};
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
      if (firstName) changes.firstName = firstName;
      if (lastName) changes.lastName = lastName;
      if (input.mobile !== undefined) {
        const mobile = requiredString(input.mobile, "mobile");
        if (!/^09\d{9}$/.test(mobile))
          throw new ApplicationError("invalid", "mobileInvalid");
        changes.mobile = mobile;
      }
      if (!Object.keys(changes).length)
        throw new ApplicationError("invalid", "updateFieldsRequired");
      const updated = changes.mobile
        ? await repository.transaction(async (transaction) => {
            const current = await find(id, transaction);
            const changingMobile = changes.mobile !== current.mobile;
            await mobileContext(transaction, actor, id, mode, changingMobile);
            if (changes.mobile !== current.mobile) {
              const code = requiredString(input.otp, "otp");
              if (!otp)
                throw new Error("Mobile verification is not configured.");
              await transaction.consumeOtp(
                otp.prepare(
                  changes.mobile!,
                  "change_mobile",
                  code,
                  mobileSubject(
                    actor,
                    id,
                    current.mobile,
                    changes.mobile!,
                    mode,
                  ),
                ),
              );
            } else {
              // An unchanged form field must not overwrite a concurrent change.
              delete changes.mobile;
            }
            return transaction.update(id, changes, actor.account.id);
          })
        : await repository.update(id, changes, actor.account.id);
      if (!updated) throw new ApplicationError("not-found", "userNotFound");
      const roles = await repository.getRoles([id]);
      return serialize(updated, roles.get(id) ?? []);
    },
  };
};

export type UsersService = ReturnType<typeof createUsersService>;
