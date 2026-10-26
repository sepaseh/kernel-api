import type { PermissionKey } from "../contracts/permissions.ts";

export type { PermissionKey };

export type UserRecord = {
  id: string;
  authEmail: string;
  firstName: string;
  lastName: string;
  name: string;
  mobile: string;
  profileEmail?: string;
  username?: string;
  status: "active" | "inactive";
  isSystemAdmin: boolean;
};

export type SessionRecord = {
  id: string;
  userId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
};

export type Actor = {
  account: UserRecord;
  session: SessionRecord;
  permissions: PermissionKey[];
};
