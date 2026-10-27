import type { LoggingConfig } from "../infrastructure/config.ts";
import { createLogger } from "../infrastructure/logging/logger.ts";

export const captureLogs = (
  config: LoggingConfig = {
    environment: "test",
    level: "debug",
    pretty: false,
    release: "test-release",
  },
) => {
  const lines: string[] = [];
  const logger = createLogger(config, {
    write(chunk) {
      lines.push(chunk);
    },
  });
  return {
    lines,
    logger,
    records: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
};
