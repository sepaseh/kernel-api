import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { ApplicationError } from "../../application/errors.ts";
import type { OtpAttempt, OtpGateway } from "../../application/ports/auth.ts";
import type { ServerConfig } from "../config.ts";
import type { Database } from "../db/client.ts";
import { otpCodes } from "../db/schema.ts";

type OtpExecutor = Pick<Database, "query" | "update">;

const digestPattern = /^[0-9a-f]{64}$/;

// Legacy records remain usable until their stored expiry; a v2 record never
// falls back to the legacy digest, and malformed hashes fail closed.
const matchesOtpHash = (stored: string, attempt: OtpAttempt): boolean => {
  const versioned = stored.startsWith("v2:");
  const storedDigest = versioned ? stored.slice(3) : stored;
  let candidate = attempt.legacyValueHash ?? "";
  if (versioned)
    candidate = attempt.valueHash.startsWith("v2:")
      ? attempt.valueHash.slice(3)
      : "";
  if (!digestPattern.test(storedDigest) || !digestPattern.test(candidate))
    return false;
  return timingSafeEqual(
    Buffer.from(storedDigest, "hex"),
    Buffer.from(candidate, "hex"),
  );
};

// Also used inside the password-reset transaction. A failed credential update
// must roll this consumption back together with the session revocation.
export const consumeOtpAttempt = async (
  database: OtpExecutor,
  attempt: OtpAttempt,
) => {
  const record = await database.query.otpCodes.findFirst({
    orderBy: [desc(otpCodes.createdAt), desc(otpCodes.id)],
    where: and(
      eq(otpCodes.destination, attempt.destination),
      eq(otpCodes.purpose, attempt.purpose),
      attempt.subject
        ? eq(otpCodes.subject, attempt.subject)
        : isNull(otpCodes.subject),
    ),
  });
  const now = new Date();
  if (!record) throw new ApplicationError("invalid", "otpInvalid");
  if (
    record.consumedAt !== null ||
    record.expiresAt <= now ||
    !matchesOtpHash(record.valueHash, attempt)
  )
    throw new ApplicationError("invalid", "otpInvalid");
  const consumed = await database
    .update(otpCodes)
    .set({ consumedAt: now })
    .where(and(eq(otpCodes.id, record.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  if (consumed.length !== 1)
    throw new ApplicationError("invalid", "otpInvalid");
};

export const createOtpGateway = (
  config: ServerConfig,
  database: Database,
): OtpGateway => {
  const legacyHash = (destination: string, purpose: string, value: string) =>
    createHash("sha256")
      .update(`${config.authSecret}:${destination}:${purpose}:${value}`)
      .digest("hex");
  const hash = (destination: string, purpose: string, value: string) =>
    `v2:${createHmac("sha256", config.authSecret)
      .update(JSON.stringify([destination, purpose, value]))
      .digest("hex")}`;

  return {
    consume: (attempt) => consumeOtpAttempt(database, attempt),
    async issue(destination, purpose, subject) {
      if (!config.otpCode)
        throw new Error("No OTP delivery adapter is configured.");
      const now = new Date();
      const issued = await database.all<{ id: string }>(sql`
        INSERT INTO ${otpCodes} (id, created_at, destination, expires_at, purpose, subject, value_hash)
        SELECT ${randomUUID()}, ${Math.floor(now.getTime() / 1000)}, ${destination},
          ${Math.floor((now.getTime() + 120_000) / 1000)}, ${purpose},
          ${subject || null}, ${hash(destination, purpose, config.otpCode)}
        WHERE NOT EXISTS (
          SELECT 1 FROM ${otpCodes}
          WHERE ${otpCodes.destination} = ${destination}
            AND ${otpCodes.purpose} = ${purpose}
            AND ${otpCodes.subject} IS ${subject || null}
            AND ${otpCodes.createdAt} * 1000 + 120000 > ${now.getTime()}
        )
        RETURNING id
      `);
      if (!issued.length)
        throw new ApplicationError("rate-limited", "otpThrottled");
      return { expires_in: 120, remaining_seconds: 120 };
    },
    prepare: (destination, purpose, value, subject) => ({
      destination,
      legacyValueHash: legacyHash(destination, purpose, value),
      purpose,
      subject,
      valueHash: hash(destination, purpose, value),
    }),
  };
};
