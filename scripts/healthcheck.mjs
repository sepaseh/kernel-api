import { fileURLToPath } from "node:url";

export async function checkHealth(mode, target) {
  if (mode !== "api") {
    throw new Error("Health mode must be api.");
  }
  const url = new URL(target ?? "http://127.0.0.1:3000/health");
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error(
      "Health target must be an HTTP(S) URL without credentials.",
    );
  }
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: "application/json" },
  });
  if (response.status !== 200) throw new Error("Service is not ready.");
  if ((await response.json()).status !== "ok")
    throw new Error("API readiness response is invalid.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 4) throw new Error("Unexpected arguments.");
    await checkHealth(process.argv[2], process.argv[3]);
  } catch {
    console.error("Service readiness check failed.");
    process.exitCode = 1;
  }
}
