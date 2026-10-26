import type { PermissionKey } from "../models.ts";

export type RoleRecord = {
  id: string;
  name: string;
  permissions: PermissionKey[];
};

export type RolesRepository = {
  create(role: RoleRecord): Promise<RoleRecord>;
  deleteIfUnassigned(id: string): Promise<"deleted" | "missing" | "assigned">;
  find(id: string): Promise<RoleRecord | undefined>;
  list(): Promise<RoleRecord[]>;
  update(
    id: string,
    role: Omit<RoleRecord, "id">,
  ): Promise<RoleRecord | undefined>;
};
