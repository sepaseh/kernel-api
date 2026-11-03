import { randomUUID } from "node:crypto";

// Retain the caller signature while keeping the identity independent of mobile.
export const internalEmail: (mobile: string) => string = () =>
  `${randomUUID()}@kernel.local`;
