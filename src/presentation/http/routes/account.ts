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
    if (body.mobile !== undefined) {
      enforceAuthAttempt(
        context,
        "mobile-change-confirm",
        `${actor.account.id}:${actor.account.id}`,
        10,
      );
      const { services } = context.get("dependencies");
      const updated = await services.users.update(
        actor,
        actor.account.id,
        body,
        "profile",
      );
      return context.json(
        await services.account.getAccount({
          ...actor,
          account: {
            ...actor.account,
            firstName: updated.first_name,
            lastName: updated.last_name,
            mobile: updated.mobile,
            isSystemAdmin: updated.is_system_admin,
            status: updated.status,
            profileEmail: updated.email,
            username: updated.username,
          },
        }),
      );
    }
    return context.json(
      await context
        .get("dependencies")
        .services.account.updateProfile(actor, body),
    );
  });

  app.post("/request-mobile-verification", async (context) => {
    const actor = await authenticate(context);
    enforceAuthAttempt(
      context,
      "mobile-change-issue",
      `${actor.account.id}:${actor.account.id}`,
      10,
    );
    return context.json(
      await context
        .get("dependencies")
        .services.users.requestMobileVerification(
          actor,
          actor.account.id,
          await parseJson(context),
          "profile",
        ),
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
