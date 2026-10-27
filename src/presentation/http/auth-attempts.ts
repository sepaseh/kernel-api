import { createHash } from "node:crypto";

import type { Context } from "hono";

import type { HttpDependencies } from "./dependencies.ts";
import { ApiError, type AppEnvironment } from "./http.ts";

type Window = { count: number; expiresAt: number };
const windowsByApplication = new WeakMap<
  HttpDependencies,
  Map<string, Window>
>();
const duration = 15 * 60 * 1000;
const maximumWindows = 10_000;

const removeExpiredWindows = (windows: Map<string, Window>, stamp: number) => {
  for (const [key, window] of windows)
    if (window.expiresAt <= stamp) windows.delete(key);
};

const currentWindow = (
  windows: Map<string, Window>,
  key: string,
  stamp: number,
) => {
  const previous = windows.get(key);
  if (previous && previous.expiresAt > stamp) return previous;

  if (windows.size >= maximumWindows) removeExpiredWindows(windows, stamp);
  if (!previous && windows.size >= maximumWindows)
    throw new ApiError(429, "authThrottled");

  const window = { count: 0, expiresAt: stamp + duration };
  windows.set(key, window);
  return window;
};

// A bounded, single-process backstop for the native API wrappers. Shared
// deployments still need an ingress or shared-store limiter; this trusts no XFF.
export function enforceAuthAttempt(
  context: Context<AppEnvironment>,
  scope: string,
  identity: string,
  maximum = 20,
) {
  const dependencies = context.get("dependencies");
  let windows = windowsByApplication.get(dependencies);
  if (!windows) {
    windows = new Map();
    windowsByApplication.set(dependencies, windows);
  }
  const stamp = Date.now();
  const hash = createHash("sha256").update(identity).digest("hex");
  for (const [key, limit] of [
    [`${scope}:global`, 2000],
    [`${scope}:${hash}`, maximum],
  ] as const) {
    const window = currentWindow(windows, key, stamp);
    if (window.count >= limit) {
      context.header(
        "Retry-After",
        String(Math.max(1, Math.ceil((window.expiresAt - stamp) / 1000))),
      );
      throw new ApiError(429, "authThrottled");
    }
    window.count++;
  }
}
