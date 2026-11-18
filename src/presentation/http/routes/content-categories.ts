import { Hono } from "hono";

import { type AppEnvironment, authenticate, parseJson } from "../http.ts";

export const createContentCategoryRoutes = () => {
  const app = new Hono<AppEnvironment>();
  app.get("/", async (context) => {
    const actor = await authenticate(context);
    return context.json(
      await context.get("dependencies").services.contentCategories.list(actor),
    );
  });
  app.post("/", async (context) => {
    await authenticate(context, { permission: "content-categories.create" });
    return context.json(
      await context
        .get("dependencies")
        .services.contentCategories.create(await parseJson(context)),
      201,
    );
  });
  app.patch("/sort", async (context) => {
    await authenticate(context, { permission: "content-categories.update" });
    await context
      .get("dependencies")
      .services.contentCategories.sort(await parseJson(context));
    return context.body(null, 200);
  });
  app.get("/:contentCategoryId", async (context) => {
    await authenticate(context, { permission: "content-categories.read" });
    return context.json(
      await context
        .get("dependencies")
        .services.contentCategories.get(context.req.param("contentCategoryId")),
    );
  });
  app.patch("/:contentCategoryId", async (context) => {
    await authenticate(context, { permission: "content-categories.update" });
    return context.json(
      await context
        .get("dependencies")
        .services.contentCategories.update(
          context.req.param("contentCategoryId"),
          await parseJson(context),
        ),
    );
  });
  app.delete("/:contentCategoryId", async (context) => {
    await authenticate(context, { permission: "content-categories.delete" });
    await context
      .get("dependencies")
      .services.contentCategories.remove(
        context.req.param("contentCategoryId"),
      );
    return context.body(null, 200);
  });
  return app;
};
