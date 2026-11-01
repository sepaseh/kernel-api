import { permissionKeys } from "../contracts/permissions.ts";
import type { ApiMessageKey as MessageKey } from "./localization.ts";
import type { PermissionKey } from "./models.ts";
export { permissionKeys };
export const permissionGroupDefinitions = [
  {
    name: "calendar",
    permissions: [
      { name: "calendar.read", titleKey: "permissionCalendarRead" },
      { name: "calendar.update", titleKey: "permissionCalendarUpdate" },
    ],
    titleKey: "permissionCalendar",
  },
  {
    name: "roles",
    permissions: [
      { name: "roles.create", titleKey: "permissionRolesCreate" },
      { name: "roles.delete", titleKey: "permissionRolesDelete" },
      { name: "roles.read", titleKey: "permissionRolesRead" },
      { name: "roles.update", titleKey: "permissionRolesUpdate" },
    ],
    titleKey: "permissionRoles",
  },
  {
    name: "settings",
    permissions: [
      { name: "settings.update", titleKey: "permissionSettingsUpdate" },
    ],
    titleKey: "permissionSettings",
  },
  {
    name: "users",
    permissions: [
      { name: "users.create", titleKey: "permissionUsersCreate" },
      { name: "users.delete", titleKey: "permissionUsersDelete" },
      { name: "users.read", titleKey: "permissionUsersRead" },
      { name: "users.update", titleKey: "permissionUsersUpdate" },
    ],
    titleKey: "permissionUsers",
  },
] satisfies Array<{
  name: string;
  permissions: Array<{ name: PermissionKey; titleKey: MessageKey }>;
  titleKey: MessageKey;
}>;

export const isPermissionKey = (value: unknown): value is PermissionKey =>
  typeof value === "string" && permissionKeys.includes(value as PermissionKey);
