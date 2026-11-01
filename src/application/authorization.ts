import { ApplicationError } from "./errors.ts";
import type { Actor } from "./models.ts";
import type { AuthenticationOptions } from "./ports/auth.ts";

export const authorizeActor = (
  actor: Actor,
  options: AuthenticationOptions = {},
) => {
  if (options.systemAdmin && !actor.account.isSystemAdmin)
    throw new ApplicationError("forbidden", "systemAdminRequired");
  if (options.permission && !actor.permissions.includes(options.permission))
    throw new ApplicationError("forbidden", "permissionDenied");
};
