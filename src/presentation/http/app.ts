import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";

import {
  getTranslator,
  resolveLanguage,
} from "../../infrastructure/localization/i18n.ts";
import type { HttpDependencies } from "./dependencies.ts";
import { ApiError, type AppEnvironment, respondToError } from "./http.ts";
import { requestLogging } from "./request-logging.ts";
import { createAccountRoutes } from "./routes/account.ts";
import { createAuthRoutes } from "./routes/auth.ts";
import { createCalendarRoutes } from "./routes/calendar.ts";
import { createFileRoutes } from "./routes/files.ts";
import { createRoleRoutes } from "./routes/roles.ts";
import {
  createLanguageRoutes,
  createSettingsRoutes,
} from "./routes/settings.ts";
import { createUserRoutes } from "./routes/users.ts";

export const createHttpApp = (dependencies: HttpDependencies) => {
  const app = new Hono<AppEnvironment>();

  app.use("*", requestId({ limitLength: 128 }));
  app.use("*", requestLogging(dependencies.logger));
  app.use(
    "*",
    cors({
      allowHeaders: [
        "Accept-Language",
        "Authorization",
        "Content-Type",
        "X-Request-Id",
      ],
      allowMethods: ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"],
      credentials: true,
      exposeHeaders: ["X-Request-Id"],
      origin: dependencies.config.allowedOrigins,
    }),
  );
  app.use("*", async (context, next) => {
    context.set("dependencies", dependencies);
    context.set("translate", getTranslator("en"));
    const language = resolveLanguage(
      await dependencies.services.settings.getLanguageCode(),
    );
    context.set("translate", getTranslator(language));
    context.header("Content-Language", language);
    if (!["GET", "HEAD", "OPTIONS"].includes(context.req.method)) {
      const origin = context.req.header("Origin");
      if (
        origin
          ? !dependencies.config.allowedOrigins.includes(origin)
          : Boolean(
              context.req.header("Cookie") ||
              context.req.header("Sec-Fetch-Site"),
            )
      )
        throw new ApiError(403, "originForbidden");
    }
    if (
      /^\/(?:auth|account|calendar|languages|users|roles)(?:\/|$)/.test(
        context.req.path,
      )
    )
      context.header("Cache-Control", "private, no-store");
    await next();
  });

  app.get("/health", (context) => context.json({ status: "ok" }));
  app.route("/account", createAccountRoutes());
  app.route("/auth", createAuthRoutes());
  app.route("/calendar", createCalendarRoutes());
  app.route("/files", createFileRoutes());
  app.route("/languages", createLanguageRoutes());
  app.route("/roles", createRoleRoutes());
  app.route("/settings", createSettingsRoutes());
  app.route("/users", createUserRoutes());

  app.notFound((context) =>
    context.json({ message: context.get("translate")("notFound") }, 404),
  );
  app.onError(respondToError);

  return app;
};
