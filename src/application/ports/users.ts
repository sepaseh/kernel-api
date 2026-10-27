import type { UserRecord } from "../models.ts";
import type { OtpAttempt } from "./auth.ts";

export type UserRole = { id: string; name: string };
// Persistence composes the full name atomically from patched and current parts.
export type UserUpdate = Partial<
  Pick<UserRecord, "firstName" | "lastName" | "mobile">
>;
type UsersQuery = {
  email?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  offset: number;
  size: number;
  status?: UserRecord["status"];
  username?: string;
};

// Only the operations needed by user administration participate in this
// transaction; application policy never receives an ORM transaction object.
export type UsersWritePort = {
  countActiveAdmins: () => Promise<number>;
  deleteSessions: (userId: string) => Promise<void>;
  existingRoleIds: (ids: string[]) => Promise<string[]>;
  find: (id: string) => Promise<UserRecord | undefined>;
  hasActiveSession: (sessionId: string, userId: string) => Promise<boolean>;
  hasPermission: (
    userId: string,
    permission: "users.update",
  ) => Promise<boolean>;
  consumeOtp: (attempt: OtpAttempt) => Promise<void>;
  remove: (id: string) => Promise<"deleted" | "in-use">;
  replaceRoles: (userId: string, roleIds: string[]) => Promise<void>;
  resetCredentialPassword: (userId: string, hash: string) => Promise<boolean>;
  setStatus: (id: string, status: UserRecord["status"]) => Promise<void>;
  setSystemAdmin: (id: string, value: boolean) => Promise<void>;
  update: (
    id: string,
    update: UserUpdate,
    actorId: string,
  ) => Promise<UserRecord | undefined>;
};

export type UsersRepository = {
  deleteSessions: (userId: string) => Promise<void>;
  find: (id: string) => Promise<UserRecord | undefined>;
  getRoles: (userIds: string[]) => Promise<Map<string, UserRole[]>>;
  list: (query: UsersQuery) => Promise<{ items: UserRecord[]; total: number }>;
  transaction: <T>(
    work: (transaction: UsersWritePort) => Promise<T>,
  ) => Promise<T>;
  // A mobile change requires an active actor changing their own account or an
  // active system administrator. Check live state in the conditional write;
  // rejection must not apply any part of the update.
  update: (
    id: string,
    update: UserUpdate,
    actorId: string,
  ) => Promise<UserRecord | undefined>;
};
