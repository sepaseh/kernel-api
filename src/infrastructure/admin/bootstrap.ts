import { randomUUID } from "node:crypto";

import { count } from "drizzle-orm";

import { internalEmail } from "../../application/identity.ts";
import type { Auth } from "../auth/better-auth.ts";
import type { Database } from "../db/client.ts";
import { account, user } from "../db/schema.ts";

type InitialAdminInput = {
  first_name: string;
  last_name: string;
  mobile: string;
  password: string;
  username: string;
};

export const parseInitialAdminInput = (input: unknown): InitialAdminInput => {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Invalid initial administrator input.");
  const fields = input as Record<string, unknown>;
  const text = (key: string) => {
    const value = fields[key];
    if (typeof value !== "string" || !value.trim() || value.length > 1000)
      throw new Error("Invalid initial administrator input.");
    return value.trim();
  };
  const firstName = text("first_name");
  const lastName = text("last_name");
  const mobile = text("mobile");
  const username = text("username").toLowerCase();
  const password = fields.password;
  if (
    !/^09\d{9}$/.test(mobile) ||
    !/^[a-z0-9_.-]{3,30}$/.test(username) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128 ||
    password !== password.trim()
  )
    throw new Error("Invalid initial administrator input.");
  return {
    first_name: firstName,
    last_name: lastName,
    mobile,
    password,
    username,
  };
};

// This operational adapter deliberately bypasses sign-up's automatic session
// creation. Its credential format and hash are Better Auth's own email/password
// format; both records become visible only after the write transaction commits.
export const createInitialAdmin = async (
  database: Database,
  auth: Auth,
  input: unknown,
) => {
  const values = parseInitialAdminInput(input);
  const passwordHash = await (
    await auth.$context
  ).password.hash(values.password);

  await database.transaction(async (transaction) => {
    const [existing] = await transaction.select({ count: count() }).from(user);
    if (existing.count !== 0)
      throw new Error(
        "Initial administrator requires a database with no users.",
      );
    const id = randomUUID();
    const now = new Date();
    await transaction.insert(user).values({
      createdAt: now,
      displayUsername: values.username,
      email: internalEmail(values.mobile),
      emailVerified: false,
      firstName: values.first_name,
      id,
      isSystemAdmin: true,
      lastName: values.last_name,
      mobile: values.mobile,
      name: `${values.first_name} ${values.last_name}`,
      status: "active",
      updatedAt: now,
      username: values.username,
    });
    await transaction.insert(account).values({
      accountId: id,
      createdAt: now,
      id: randomUUID(),
      password: passwordHash,
      providerId: "credential",
      updatedAt: now,
      userId: id,
    });
  });
};
