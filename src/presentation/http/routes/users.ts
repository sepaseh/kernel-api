import { Hono } from "hono";

import { enforceAuthAttempt } from "../auth-attempts.ts";
import { type AppEnvironment, authenticate, parseJson } from "../http.ts";

export const createUserRoutes = () => {
  const app = new Hono<AppEnvironment>();
  app.get("/", async (context) => {
    await authenticate(context, { permission: "users.read" });
    return context.json(
      await context
        .get("dependencies")
        .services.users.list(context.req.query()),
    );
  });
  app.post("/", async (context) => {
    await authenticate(context, { permission: "users.create" });
    return context.json(
      await context
        .get("dependencies")
        .services.users.create(await parseJson(context)),
      201,
    );
  });
  app.get("/:userId", async (context) => {
    await authenticate(context, { permission: "users.read" });
    return context.json(
      await context
        .get("dependencies")
        .services.users.get(context.req.param("userId")),
    );
  });
  app.patch("/:userId", async (context) => {
    const actor = await authenticate(context, { permission: "users.update" });
    const body = await parseJson(context);
    if (body.mobile !== undefined)
      enforceAuthAttempt(
        context,
        "mobile-change-confirm",
        `${actor.account.id}:${context.req.param("userId")}`,
        10,
      );
    return context.json(
      await context
        .get("dependencies")
        .services.users.update(actor, context.req.param("userId"), body),
    );
  });
  app.post("/:userId/request-mobile-verification", async (context) => {
    const actor = await authenticate(context, { permission: "users.update" });
    const id = context.req.param("userId");
    enforceAuthAttempt(
      context,
      "mobile-change-issue",
      `${actor.account.id}:${id}`,
      10,
    );
    return context.json(
      await context
        .get("dependencies")
        .services.users.requestMobileVerification(
          actor,
          id,
          await parseJson(context),
          "management",
        ),
    );
  });
  app.delete("/:userId", async (context) => {
    const actor = await authenticate(context, { permission: "users.delete" });
    await context
      .get("dependencies")
      .services.users.remove(actor, context.req.param("userId"));
    return context.body(null, 200);
  });
  app.patch("/:userId/status", async (context) => {
    const actor = await authenticate(context, { permission: "users.update" });
    await context
      .get("dependencies")
      .services.users.setStatus(
        actor,
        context.req.param("userId"),
        await parseJson(context),
      );
    return context.body(null, 200);
  });
  app.put("/:userId/roles", async (context) => {
    await authenticate(context, { permission: "users.update" });
    await context
      .get("dependencies")
      .services.users.replaceRoles(
        context.req.param("userId"),
        await parseJson(context),
      );
    return context.body(null, 200);
  });
  app.patch("/:userId/system-admin", async (context) => {
    await authenticate(context, { systemAdmin: true });
    await context
      .get("dependencies")
      .services.users.setSystemAdmin(
        context.req.param("userId"),
        await parseJson(context),
      );
    return context.body(null, 200);
  });
  app.put("/:userId/password", async (context) => {
    await authenticate(context, { systemAdmin: true });
    await context
      .get("dependencies")
      .services.users.resetPassword(
        context.req.param("userId"),
        await parseJson(context),
      );
    return context.body(null, 200);
  });
  return app;
};
