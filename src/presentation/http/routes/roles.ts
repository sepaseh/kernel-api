import { Hono } from "hono";

import { permissionGroupDefinitions } from "../../../application/permissions.ts";
import { type AppEnvironment, authenticate, parseJson } from "../http.ts";

export const createRoleRoutes = () => {
  const app = new Hono<AppEnvironment>();
  app.get("/permissions", async (context) => {
    await authenticate(context, { permission: "roles.read" });
    const translate = context.get("translate");
    return context.json(
      permissionGroupDefinitions.map(({ name, permissions, titleKey }) => ({
        name,
        permissions: permissions.map(
          ({ name: permissionName, titleKey: permissionTitle }) => ({
            name: permissionName,
            title: translate(permissionTitle),
          }),
        ),
        title: translate(titleKey),
      })),
    );
  });
  app.get("/", async (context) => {
    await authenticate(context, { permission: "roles.read" });
    return context.json(
      await context.get("dependencies").services.roles.list(),
    );
  });
  app.post("/", async (context) => {
    await authenticate(context, { permission: "roles.create" });
    return context.json(
      await context
        .get("dependencies")
        .services.roles.create(await parseJson(context)),
      201,
    );
  });
  app.get("/:roleId", async (context) => {
    await authenticate(context, { permission: "roles.read" });
    return context.json(
      await context
        .get("dependencies")
        .services.roles.get(context.req.param("roleId")),
    );
  });
  app.patch("/:roleId", async (context) => {
    await authenticate(context, { permission: "roles.update" });
    return context.json(
      await context
        .get("dependencies")
        .services.roles.update(
          context.req.param("roleId"),
          await parseJson(context),
        ),
    );
  });
  app.delete("/:roleId", async (context) => {
    await authenticate(context, { permission: "roles.delete" });
    await context
      .get("dependencies")
      .services.roles.remove(context.req.param("roleId"));
    return context.body(null, 200);
  });
  return app;
};
