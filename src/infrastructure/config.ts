import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Relative runtime data paths resolve against this standalone repository.
export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

const trustedOrigin = (value: string) => {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Allowed origins must be exact HTTP(S) origins without paths or credentials.",
    );
  return url.origin;
};

export const resolveDatabaseUrl = (value: string) => {
  if (
    !value.startsWith("file:") ||
    value.startsWith("file://") ||
    value === "file::memory:"
  )
    return value;
  return pathToFileURL(
    path.resolve(repositoryRoot, value.slice("file:".length)),
  ).href;
};

export type LoggingConfig = {
  environment: string;
  level: "debug" | "info" | "warn" | "error";
  pretty: boolean;
  release: string;
};

export type ServerConfig = {
  allowedOrigin: string;
  allowedOrigins: string[];
  authSecret: string;
  baseUrl: string;
  databaseUrl: string;
  host: string;
  localStoragePath: string;
  logging: LoggingConfig;
  minio: {
    accessKey: string;
    bucket: string;
    endPoint: string;
    port: number;
    publicUrl: string;
    secretKey: string;
    useSSL: boolean;
  };
  otpCode?: string;
  port: number;
  seedDevelopmentData: boolean;
  storageDriver: "local" | "minio";
  uploadLimitBytes: number;
};

export const loadLoggingConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): LoggingConfig => {
  const runtime = environment.NODE_ENV ?? "development";
  const name = environment.SERVER_ENVIRONMENT ?? runtime;
  const release = environment.SERVER_RELEASE_ID ?? "development";
  const level =
    environment.LOG_LEVEL ?? (runtime === "development" ? "debug" : "info");
  if (
    level !== "debug" &&
    level !== "info" &&
    level !== "warn" &&
    level !== "error"
  ) {
    throw new Error("LOG_LEVEL must be debug, info, warn, or error.");
  }
  if (
    !/^[a-zA-Z0-9_.-]{1,64}$/.test(name) ||
    !/^[a-zA-Z0-9_.@/-]{1,128}$/.test(release)
  ) {
    throw new Error("Logging environment or release identifier is invalid.");
  }
  if (runtime === "production" && !environment.SERVER_RELEASE_ID) {
    throw new Error("SERVER_RELEASE_ID is required in production.");
  }
  return {
    environment: name,
    level,
    pretty: runtime === "development" && name === "development",
    release,
  };
};

const numberFromEnvironment = (
  name: string,
  value: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  )
    throw new Error(`${name} must be a whole number between 1 and ${maximum}.`);
  return parsed;
};

const resolveStorageDriver = (environment: NodeJS.ProcessEnv) => {
  const supplied = environment.STORAGE_DRIVER;
  if (supplied !== undefined && supplied !== "local" && supplied !== "minio")
    throw new Error("STORAGE_DRIVER must be local or minio.");
  return (
    supplied ?? (environment.NODE_ENV === "production" ? "minio" : "local")
  );
};

const requireConfiguration = (
  environment: NodeJS.ProcessEnv,
  storageDriver: ServerConfig["storageDriver"],
) => {
  const required =
    environment.NODE_ENV === "production"
      ? ["BETTER_AUTH_URL", "DATABASE_URL"]
      : [];
  if (storageDriver === "minio")
    required.push(
      "MINIO_ACCESS_KEY",
      "MINIO_ENDPOINT",
      "MINIO_PUBLIC_URL",
      "MINIO_SECRET_KEY",
    );
  const missing = required.filter((name) => !environment[name]?.trim());
  if (
    environment.NODE_ENV === "production" &&
    !environment.SERVER_ALLOWED_ORIGINS?.trim() &&
    !environment.SERVER_ALLOWED_ORIGIN?.trim()
  )
    missing.push("SERVER_ALLOWED_ORIGINS or SERVER_ALLOWED_ORIGIN");
  if (missing.length)
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
};

const minioUsesSSL = (environment: NodeJS.ProcessEnv) => {
  if (
    environment.MINIO_USE_SSL !== undefined &&
    !["true", "false"].includes(environment.MINIO_USE_SSL)
  )
    throw new Error("MINIO_USE_SSL must be true or false.");
  return environment.MINIO_USE_SSL === "true";
};

const resolveAllowedOrigins = (
  environment: NodeJS.ProcessEnv,
  baseUrl: string,
) => {
  const defaultOrigins =
    environment.NODE_ENV === "production"
      ? [environment.SERVER_ALLOWED_ORIGIN!]
      : [
          environment.SERVER_ALLOWED_ORIGIN ?? "http://localhost:5173",
          "http://localhost:3001",
        ];
  const configuredOrigins = environment.SERVER_ALLOWED_ORIGINS?.trim()
    ? environment.SERVER_ALLOWED_ORIGINS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : defaultOrigins;
  if (!configuredOrigins.length)
    throw new Error("At least one allowed browser origin is required.");
  return [...new Set([...configuredOrigins.map(trustedOrigin), baseUrl])];
};

export const loadConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig => {
  if (!environment.BETTER_AUTH_SECRET?.trim())
    throw new Error("BETTER_AUTH_SECRET is required.");
  const developmentFeaturesEnabled =
    environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
  if (environment.OTP_FIXED_CODE !== undefined && !developmentFeaturesEnabled)
    throw new Error(
      "OTP_FIXED_CODE requires NODE_ENV=development or NODE_ENV=test.",
    );
  const storageDriver = resolveStorageDriver(environment);
  requireConfiguration(environment, storageDriver);
  const port = numberFromEnvironment("PORT", environment.PORT, 3000, 65535);
  const minioPort = numberFromEnvironment(
    "MINIO_PORT",
    environment.MINIO_PORT,
    9000,
    65535,
  );
  const minioUseSSL = minioUsesSSL(environment);
  const minioEndpoint = environment.MINIO_ENDPOINT ?? "localhost";
  const minioProtocol = minioUseSSL ? "https" : "http";
  const baseUrl = trustedOrigin(
    environment.BETTER_AUTH_URL ?? `http://localhost:${port}`,
  );
  const allowedOrigins = resolveAllowedOrigins(environment, baseUrl);

  return {
    allowedOrigin: allowedOrigins[0],
    allowedOrigins,
    authSecret: environment.BETTER_AUTH_SECRET,
    baseUrl,
    databaseUrl: resolveDatabaseUrl(
      environment.DATABASE_URL ?? "file:server/data/kernel.sqlite",
    ),
    host: environment.HOST ?? "localhost",
    localStoragePath: path.resolve(
      repositoryRoot,
      environment.LOCAL_STORAGE_PATH ?? "server/data/uploads",
    ),
    logging: loadLoggingConfig(environment),
    minio: {
      accessKey: environment.MINIO_ACCESS_KEY ?? "",
      bucket: environment.MINIO_BUCKET ?? "kernel",
      endPoint: minioEndpoint,
      port: minioPort,
      publicUrl:
        environment.MINIO_PUBLIC_URL ??
        `${minioProtocol}://${minioEndpoint}:${minioPort}`,
      secretKey: environment.MINIO_SECRET_KEY ?? "",
      useSSL: minioUseSSL,
    },
    otpCode: environment.OTP_FIXED_CODE,
    port,
    seedDevelopmentData:
      developmentFeaturesEnabled &&
      environment.SERVER_SEED_DEVELOPMENT_DATA === "true",
    storageDriver,
    uploadLimitBytes: numberFromEnvironment(
      "UPLOAD_LIMIT_BYTES",
      environment.UPLOAD_LIMIT_BYTES,
      5 * 1024 * 1024,
    ),
  };
};
