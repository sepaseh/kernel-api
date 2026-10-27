import type { Context } from "hono";
import { Hono } from "hono";

import { requiredString } from "../../../application/validation.ts";
import type { AccessTokenResponse } from "../../../contracts/auth.ts";
import { enforceAuthAttempt } from "../auth-attempts.ts";
import type { AppEnvironment } from "../http.ts";
import { authenticate, bindAuthenticatedUser, parseJson } from "../http.ts";

const copyCookies = (context: Context<AppEnvironment>, cookies: string[]) => {
  for (const cookie of cookies)
    context.header("Set-Cookie", cookie, { append: true });
};

export const createAuthRoutes = () => {
  const app = new Hono<AppEnvironment>();

  app.post("/login", async (context) => {
    const body = await parseJson(context);
    enforceAuthAttempt(
      context,
      "login",
      requiredString(body.identifier, "identifier"),
    );
    const { services } = context.get("dependencies");
    const service = services.auth.fromRequest(context.req.raw.headers);
    const result = await service.login(body);
    bindAuthenticatedUser(context, result.userId);
    copyCookies(context, service.responseCookies());
    return context.json({
      access_token: result.token,
    } satisfies AccessTokenResponse);
  });

  app.post("/register", async (context) => {
    const body = await parseJson(context);
    enforceAuthAttempt(
      context,
      "register",
      requiredString(body.mobile, "mobile"),
      10,
    );
    const { services } = context.get("dependencies");
    const service = services.auth.fromRequest(context.req.raw.headers);
    const result = await service.register(body);
    bindAuthenticatedUser(context, result.userId);
    copyCookies(context, service.responseCookies());
    return context.json(
      { access_token: result.token } satisfies AccessTokenResponse,
      201,
    );
  });

  app.post("/otp-request", async (context) => {
    const body = await parseJson(context);
    enforceAuthAttempt(
      context,
      "otp-request",
      requiredString(body.mobile, "mobile"),
      10,
    );
    const { services } = context.get("dependencies");
    return context.json(
      await services.auth.fromRequest(context.req.raw.headers).requestOtp(body),
    );
  });

  app.post("/refresh-token", async (context) => {
    const actor = await authenticate(context);
    return context.json({
      access_token: actor.session.token,
    } satisfies AccessTokenResponse);
  });

  app.post("/logout", async (context) => {
    const { services } = context.get("dependencies");
    const service = services.auth.fromRequest(context.req.raw.headers);
    await service.logout();
    copyCookies(context, service.responseCookies());
    return context.body(null, 200);
  });

  app.post("/change-password", async (context) => {
    const actor = await authenticate(context);
    const body = await parseJson(context);
    const { services } = context.get("dependencies");
    const service = services.auth.fromRequest(context.req.raw.headers);
    await service.changePassword(actor, body);
    copyCookies(context, service.responseCookies());
    return context.body(null, 200);
  });

  app.post("/forgot-password", async (context) => {
    const body = await parseJson(context);
    enforceAuthAttempt(
      context,
      "recovery",
      requiredString(body.mobile, "mobile"),
      10,
    );
    const { services } = context.get("dependencies");
    await services.auth
      .fromRequest(context.req.raw.headers)
      .forgotPassword(body);
    return context.body(null, 200);
  });

  return app;
};
