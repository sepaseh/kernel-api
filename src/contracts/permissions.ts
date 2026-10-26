export const permissionKeys = [
  "calendar.read",
  "calendar.update",
  "roles.create",
  "roles.delete",
  "roles.read",
  "roles.update",
  "settings.update",
  "users.create",
  "users.delete",
  "users.read",
  "users.update",
] as const;
export type PermissionKey = (typeof permissionKeys)[number];
