import type { PermissionKey } from "../../contracts/permissions.ts";
import type { UserRecord } from "../models.ts";

export type AccountPersistence = {
  getPermissions: (userId: string) => Promise<PermissionKey[]>;
  updateProfile: (
    current: UserRecord,
    update: { firstName?: string; lastName?: string },
  ) => Promise<UserRecord>;
  updateUsername: (userId: string, username: string) => Promise<UserRecord>;
  verifyEmail: (userId: string, email: string) => Promise<void>;
};
