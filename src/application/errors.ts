import type { ApiMessageKey as MessageKey } from "./localization.ts";

export type FailureKind =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "too-large"
  | "unsupported-media"
  | "rate-limited"
  | "internal";

export class ApplicationError extends Error {
  readonly kind: FailureKind;
  readonly key: MessageKey;
  readonly values?: Record<string, string | number>;

  constructor(
    kind: FailureKind,
    key: MessageKey,
    values?: Record<string, string | number>,
  ) {
    super(key);
    this.name = "ApplicationError";
    this.kind = kind;
    this.key = key;
    this.values = values;
  }
}
