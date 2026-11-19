import { Hono } from "hono";

import { type AppEnvironment, authenticate, parseJson } from "../http.ts";

export const createFaqRoutes = () => {
  const app = new Hono<AppEnvironment>();
  app.get("/", async (context) => {
    await authenticate(context, { permission: "faqs.read" });
    return context.json(await context.get("dependencies").services.faqs.list());
  });
  app.post("/", async (context) => {
    await authenticate(context, { permission: "faqs.create" });
    return context.json(
      await context
        .get("dependencies")
        .services.faqs.create(await parseJson(context)),
      201,
    );
  });
  app.patch("/sort", async (context) => {
    await authenticate(context, { permission: "faqs.update" });
    await context
      .get("dependencies")
      .services.faqs.sort(await parseJson(context));
    return context.body(null, 200);
  });
  app.get("/:faqId", async (context) => {
    await authenticate(context, { permission: "faqs.read" });
    return context.json(
      await context
        .get("dependencies")
        .services.faqs.get(context.req.param("faqId")),
    );
  });
  app.patch("/:faqId", async (context) => {
    await authenticate(context, { permission: "faqs.update" });
    return context.json(
      await context
        .get("dependencies")
        .services.faqs.update(
          context.req.param("faqId"),
          await parseJson(context),
        ),
    );
  });
  app.delete("/:faqId", async (context) => {
    await authenticate(context, { permission: "faqs.delete" });
    await context
      .get("dependencies")
      .services.faqs.remove(context.req.param("faqId"));
    return context.body(null, 200);
  });
  return app;
};
