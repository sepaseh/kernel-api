import type { Context } from "hono";

import { authorizeActor } from "../../application/authorization.ts";
import {
  ApplicationError,
  type FailureKind,
} from "../../application/errors.ts";
import type { ApiMessageKey as MessageKey } from "../../application/localization.ts";
import type { AuthenticationOptions } from "../../application/ports/auth.ts";
import type { Translator } from "../../infrastructure/localization/i18n.ts";
import { getTranslator } from "../../infrastructure/localization/i18n.ts";
import {
  type AppLogger,
  requestLogContext,
} from "../../infrastructure/logging/logger.ts";
import type { HttpDependencies } from "./dependencies.ts";
export type AppEnvironment = {
  Variables: {
    dependencies: HttpDependencies;
    logger: AppLogger;
    requestId: string;
    translate: Translator;
    uploadStage?:
      | "authentication"
      | "validation"
      | "read"
      | "storage"
      | "metadata"
      | "response";
  };
};
const statuses = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  "not-found": 404,
  conflict: 409,
  "too-large": 413,
  "unsupported-media": 415,
  "rate-limited": 429,
  internal: 500,
} as const satisfies Record<FailureKind, number>;
type ErrorStatus = (typeof statuses)[FailureKind];
export class ApiError extends ApplicationError {
  readonly status: ErrorStatus;
  constructor(
    status: ErrorStatus,
    key: MessageKey,
    values?: Record<string, string | number>,
  ) {
    const kind = (Object.keys(statuses) as FailureKind[]).find(
      (kind) => statuses[kind] === status,
    )!;
    super(kind, key, values);
    this.name = "ApiError";
    this.status = status;
  }
}
export const respondToError = (
  error: Error,
  context: Context<AppEnvironment>,
) => {
  const translate = context.get("translate") ?? getTranslator("en");
  return error instanceof ApplicationError
    ? context.json(
        { message: translate(error.key, error.values) },
        statuses[error.kind],
      )
    : context.json({ message: translate("internalError") }, 500);
};
export const bindAuthenticatedUser = (
  context: Context<AppEnvironment>,
  userId: string,
) => {
  const logger = context.get("logger").child({ userId });
  context.set("logger", logger);
  const current = requestLogContext.getStore();
  if (current) current.logger = logger;
};
export const parseJson = async (context: Context<AppEnvironment>) => {
  const contentType = context.req
    .header("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json")
    throw new ApiError(415, "jsonContentTypeRequired");
  const maximum = 64 * 1024;
  const declared = context.req.header("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))
  )
    throw new ApiError(400, "invalidJson");
  if (declared && Number(declared) > maximum)
    throw new ApiError(413, "bodyTooLarge");
  const reader = context.req.raw.body?.getReader();
  if (!reader) throw new ApiError(400, "invalidJson");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > maximum) {
        void reader.cancel().catch(() => undefined);
        throw new ApiError(413, "bodyTooLarge");
      }
      chunks.push(item.value);
    }
    const value: unknown = JSON.parse(
      Buffer.concat(chunks, total).toString("utf8"),
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiError(400, "jsonObjectRequired");
    }

    return value as Record<string, unknown>;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalidJson");
  } finally {
    reader.releaseLock();
  }
};

export const authenticate = async (
  context: Context<AppEnvironment>,
  options: AuthenticationOptions = {},
) => {
  const actor = await context
    .get("dependencies")
    .services.auth.fromRequest(context.req.raw.headers)
    .authenticate();
  bindAuthenticatedUser(context, actor.account.id);
  authorizeActor(actor, options);
  return actor;
};
