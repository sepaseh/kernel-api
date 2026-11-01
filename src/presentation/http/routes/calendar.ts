import { Hono } from "hono";

import { type AppEnvironment, authenticate, parseJson } from "../http.ts";

export const createCalendarRoutes = () => {
  const app = new Hono<AppEnvironment>();
  app.get("/", async (context) => {
    await authenticate(context, { permission: "calendar.read" });
    return context.json(
      await context.get("dependencies").services.calendar.list(),
    );
  });
  app.post("/", async (context) => {
    await authenticate(context, { permission: "calendar.update" });
    await context
      .get("dependencies")
      .services.calendar.add(await parseJson(context));
    return context.body(null, 200);
  });
  app.delete("/:date", async (context) => {
    await authenticate(context, { permission: "calendar.update" });
    await context
      .get("dependencies")
      .services.calendar.remove(context.req.param("date"));
    return context.body(null, 200);
  });
  return app;
};
