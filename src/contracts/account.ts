import type { PermissionKey } from "./permissions.ts";

export type Account = {
  id: string;
  first_name: string;
  last_name: string;
  mobile: string;
  email?: string;
  username?: string;
  is_system_admin: boolean;
  permissions: PermissionKey[];
  status: "active" | "inactive";
};
