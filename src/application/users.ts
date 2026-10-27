import { profileNameMaxLength } from "../contracts/profile.ts";
import { ApplicationError } from "./errors.ts";
import { internalEmail } from "./identity.ts";
import type { Actor, UserRecord } from "./models.ts";
import { type AuthProvider, AuthRejection } from "./ports/auth.ts";
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
}: {
  provider: AuthProvider;
  repository: UsersRepository;
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

  return {
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
    async update(id: string, input: Record<string, unknown>) {
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
      if (typeof input.mobile === "string" && /^09\d{9}$/.test(input.mobile))
        changes.mobile = input.mobile;
      if (!Object.keys(changes).length)
        throw new ApplicationError("invalid", "updateFieldsRequired");
      const updated = await repository.update(id, changes);
      if (!updated) throw new ApplicationError("not-found", "userNotFound");
      const roles = await repository.getRoles([id]);
      return serialize(updated, roles.get(id) ?? []);
    },
  };
};

export type UsersService = ReturnType<typeof createUsersService>;
