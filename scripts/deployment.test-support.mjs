import { tmpdir } from "node:os";
import path from "node:path";

export const validApi = {
  NODE_ENV: "production",
  BETTER_AUTH_SECRET:
    "c08e1dfec01fac571c19c51a06e2f7a1055dd6eed10b91a85b7c7ee139e65835",
  BETTER_AUTH_URL: "https://api.kernel.test",
  SERVER_ALLOWED_ORIGINS: "https://kernel.test,https://admin.kernel.test",
  SERVER_RELEASE_ID: "qa-0123456789",
  DATABASE_URL: `file:${path.join(tmpdir(), "kernel-deployment-fixture.sqlite")}`,
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_PATH: path.join(tmpdir(), "kernel-deployment-fixture-uploads"),
  SERVER_SEED_DEVELOPMENT_DATA: "false",
};

export const publicValues = {
  API_HOST: "api.kernel.test",
  TLS_CERTIFICATE: "/etc/kernel/tls/fullchain.pem",
  TLS_CERTIFICATE_KEY: "/etc/kernel/tls/privkey.pem",
  RELEASE_ID: "qa-0123456789",
};
