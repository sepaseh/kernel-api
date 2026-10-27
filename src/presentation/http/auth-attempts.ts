import { createHash } from "node:crypto";

import type { Context } from "hono";

import type { HttpDependencies } from "./dependencies.ts";
import { ApiError, type AppEnvironment } from "./http.ts";

type Window = { count: number; expiresAt: number };
type Windows = { entries: Map<string, Window>; nextExpiry: number };
const windowsByApplication = new WeakMap<HttpDependencies, Windows>();
const duration = 15 * 60 * 1000;
const maximumWindows = 10_000;

const removeExpiredWindows = (windows: Windows, stamp: number) => {
  windows.nextExpiry = Number.POSITIVE_INFINITY;
  for (const [key, window] of windows.entries) {
    if (window.expiresAt <= stamp) {
      windows.entries.delete(key);
    } else windows.nextExpiry = Math.min(windows.nextExpiry, window.expiresAt);
  }
};

const currentWindow = (
  windows: Windows,
  key: string,
  stamp: number,
  onCapacity: (retryAfter: number) => void,
) => {
  const previous = windows.entries.get(key);
  if (previous && previous.expiresAt > stamp) return previous;

  windows.entries.delete(key);
  if (windows.entries.size >= maximumWindows) {
    if (stamp >= windows.nextExpiry) removeExpiredWindows(windows, stamp);
    if (windows.entries.size >= maximumWindows) {
      onCapacity(Math.max(1, Math.ceil((windows.nextExpiry - stamp) / 1000)));
      throw new ApiError(429, "authThrottled");
    }
  }

  const window = { count: 0, expiresAt: stamp + duration };
  windows.entries.set(key, window);
  windows.nextExpiry = Math.min(windows.nextExpiry, window.expiresAt);
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
    windows = { entries: new Map(), nextExpiry: Number.POSITIVE_INFINITY };
    windowsByApplication.set(dependencies, windows);
  }
  const stamp = Date.now();
  const hash = createHash("sha256").update(identity).digest("hex");
  const key = `${scope}:${hash}`;
  const window = currentWindow(windows, key, stamp, (retryAfter) =>
    context.header("Retry-After", String(retryAfter)),
  );
  if (window.count >= maximum) {
    context.header(
      "Retry-After",
      String(Math.max(1, Math.ceil((window.expiresAt - stamp) / 1000))),
    );
    throw new ApiError(429, "authThrottled");
  }
  window.count++;
}
