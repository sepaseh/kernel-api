import { Hono } from "hono";

import { type AppEnvironment, authenticate, parseJson } from "../http.ts";

export const createSettingsRoutes = () => {
  const app = new Hono<AppEnvironment>();
  app.get("/", async (context) => {
    context.header("Cache-Control", "no-store");
    return context.json(
      await context.get("dependencies").services.settings.get(),
    );
  });
  app.put("/", async (context) => {
    const actor = await authenticate(context, {
      permission: "settings.update",
    });
    return context.json(
      await context
        .get("dependencies")
        .services.settings.update(actor, await parseJson(context)),
    );
  });
  return app;
};

export const createLanguageRoutes = () => {
  const app = new Hono<AppEnvironment>();
  app.get("/", async (context) => {
    await authenticate(context);
    return context.json(
      context.get("dependencies").services.settings.listLanguages(),
    );
  });
  return app;
};
