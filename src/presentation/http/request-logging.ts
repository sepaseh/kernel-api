import { randomUUID } from "node:crypto";

import type { MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";

import { ApplicationError } from "../../application/errors.ts";
import {
  type AppLogger,
  requestLogContext,
} from "../../infrastructure/logging/logger.ts";
import { sanitizeLogText } from "../../infrastructure/logging/sanitization.ts";
import { type AppEnvironment, respondToError } from "./http.ts";

const levelForStatus = (status: number) => {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
};

const reasonForError = (error: Error | undefined, status: number) => {
  if (error instanceof ApplicationError) return error.key;
  if (status >= 500) return "internalError";
  return undefined;
};

export const requestLogging =
  (rootLogger: AppLogger): MiddlewareHandler<AppEnvironment> =>
  async (context, next) => {
    const started = performance.now();
    const suppliedId = context.get("requestId");
    const requestId =
      sanitizeLogText(suppliedId) === suppliedId ? suppliedId : randomUUID();
    context.set("requestId", requestId);
    const logger = rootLogger.child({ requestId });
    context.set("logger", logger);
    await requestLogContext.run({ logger }, async () => {
      try {
        await next();
      } catch (error_) {
        // Hono handles Error instances internally, but non-Error throws escape.
        const error =
          error_ instanceof Error
            ? error_
            : new Error("Non-Error value thrown", { cause: error_ });
        context.error = error;
        context.res = respondToError(error, context);
      }

      const error = context.error;
      const durationMs = Math.round((performance.now() - started) * 100) / 100;
      context.header("X-Request-Id", context.get("requestId"));
      const status = context.res.status;
      const current = context.get("logger");
      const method = context.req.method;
      const route = matchedRoutes(context).findLast(
        (value) => value.method !== "ALL",
      )?.path;
      const level = levelForStatus(status);
      const reason = reasonForError(error, status);
      // Route templates avoid retaining personal data in path parameters or 404 URLs.
      const fields = {
        method,
        path: route ?? "[unmatched]",
        ...(reason && { reason }),
        status,
      };
      if (
        method === "POST" &&
        context.req.path === "/auth/login" &&
        status >= 400
      ) {
        current[level](
          { ...fields, event: "auth.login.failed" },
          "Login failed",
        );
      }
      if (
        method === "POST" &&
        /^\/files\/?$/.test(context.req.path) &&
        status >= 400
      ) {
        current[level](
          {
            ...fields,
            event: "file.upload.failed",
            stage: context.get("uploadStage") ?? "authentication",
          },
          "File upload failed",
        );
      }
      current[level](
        {
          ...fields,
          durationMs,
          ...(status >= 500 && error && { err: error }),
          event: "api.request.completed",
        },
        "API request completed",
      );
    });
  };
