import { Hono } from "hono";

import { enforceAuthAttempt } from "../auth-attempts.ts";
import type { AppEnvironment } from "../http.ts";
import { authenticate, parseJson } from "../http.ts";

export const createAccountRoutes = () => {
  const app = new Hono<AppEnvironment>();

  app.get("/me", async (context) => {
    const actor = await authenticate(context);
    return context.json(
      await context.get("dependencies").services.account.getAccount(actor),
    );
  });

  app.patch("/update-profile", async (context) => {
    const actor = await authenticate(context);
    const body = await parseJson(context);
    return context.json(
      await context
        .get("dependencies")
        .services.account.updateProfile(actor, body),
    );
  });

  app.post("/update-username", async (context) => {
    const actor = await authenticate(context);
    const body = await parseJson(context);
    return context.json(
      await context
        .get("dependencies")
        .services.account.updateUsername(actor, body),
    );
  });

  app.post("/request-email-verification", async (context) => {
    const actor = await authenticate(context);
    const body = await parseJson(context);
    return context.json(
      await context
        .get("dependencies")
        .services.account.requestEmailVerification(actor, body),
    );
  });

  app.post("/verify-email", async (context) => {
    const actor = await authenticate(context);
    const body = await parseJson(context);
    enforceAuthAttempt(context, "verify-email", actor.account.id, 10);
    await context.get("dependencies").services.account.verifyEmail(actor, body);
    return context.body(null, 200);
  });

  return app;
};
