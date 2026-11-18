import { Hono } from "hono";

import { type AppEnvironment, authenticate, parseJson } from "../http.ts";

export const createContentRoutes = () => {
  const app = new Hono<AppEnvironment>();
  app.get("/", async (context) => {
    await authenticate(context, { permission: "contents.read" });
    return context.json(
      await context
        .get("dependencies")
        .services.contents.list(context.req.query()),
    );
  });
  app.post("/", async (context) => {
    await authenticate(context, { permission: "contents.create" });
    return context.json(
      await context
        .get("dependencies")
        .services.contents.create(await parseJson(context)),
      201,
    );
  });
  app.get("/:contentId", async (context) => {
    await authenticate(context, { permission: "contents.read" });
    return context.json(
      await context
        .get("dependencies")
        .services.contents.get(context.req.param("contentId")),
    );
  });
  app.patch("/:contentId", async (context) => {
    await authenticate(context, { permission: "contents.update" });
    return context.json(
      await context
        .get("dependencies")
        .services.contents.update(
          context.req.param("contentId"),
          await parseJson(context),
        ),
    );
  });
  app.delete("/:contentId", async (context) => {
    await authenticate(context, { permission: "contents.delete" });
    await context
      .get("dependencies")
      .services.contents.remove(context.req.param("contentId"));
    return context.body(null, 200);
  });
  return app;
};
