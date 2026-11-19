import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { createApp } from "../../composition.ts";
import type { Faq, FaqRequest } from "../../contracts/faqs.ts";
import {
  faqAnswerMaxLength,
  faqQuestionMaxLength,
} from "../../contracts/faqs.ts";
import { createAuth } from "../../infrastructure/auth/better-auth.ts";
import { loadConfig } from "../../infrastructure/config.ts";
import { createDatabase } from "../../infrastructure/db/client.ts";
import { initializeDatabase } from "../../infrastructure/db/initialize.ts";
import {
  faqs,
  rolePermissions,
  roles,
  settings,
  user,
  userRoles,
} from "../../infrastructure/db/schema.ts";
import { getTranslator } from "../../infrastructure/localization/i18n.ts";
import { createLogger } from "../../infrastructure/logging/logger.ts";
import { MemoryObjectStorage } from "../support/memory-object-storage.ts";

let app: ReturnType<typeof createApp>;
let connection: ReturnType<typeof createDatabase>;
let adminToken: string;
let readerToken: string;

const request = (
  method: string,
  path: string,
  body?: Record<string, unknown>,
  token = adminToken,
) =>
  app.request(`http://localhost${path}`, {
    ...(body && { body: JSON.stringify(body) }),
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    method,
  });

const example = {
  answer: "Synthetic answer.",
  question: "Synthetic question?",
};

const createFaq = async (body: FaqRequest = example): Promise<Faq> => {
  const response = await request("POST", "/faqs", body);
  assert.equal(response.status, 201);
  const faq = (await response.json()) as Faq;
  assert.match(faq.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(faq, {
    id: faq.id,
    answer: body.answer.trim(),
    question: body.question.trim(),
  });
  return faq;
};

const listFaqs = async (): Promise<Faq[]> => {
  const response = await request("GET", "/faqs", undefined, readerToken);
  assert.equal(response.status, 200);
  return (await response.json()) as Faq[];
};

before(async () => {
  const config = loadConfig({
    BETTER_AUTH_SECRET:
      "synthetic-faq-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost",
    DATABASE_URL: "file::memory:",
    NODE_ENV: "test",
  });
  connection = createDatabase(config);
  const { database } = connection;
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  await initializeDatabase(config, database, auth);
  app = createApp({
    auth,
    config,
    database,
    logger,
    storage: new MemoryObjectStorage(),
  });

  const roleId = "faq-reader";
  await database.insert(roles).values({ id: roleId, name: "FAQ reader" });
  await database
    .insert(rolePermissions)
    .values({ permission: "faqs.read", roleId });

  const password = "synthetic-faq-user-password";
  const createIdentity = async (mobile: string, isSystemAdmin: boolean) => {
    const identity = await auth.api.signUpEmail({
      body: {
        email: `${mobile}@kernel.test`,
        firstName: "Synthetic",
        lastName: "FAQ user",
        mobile,
        name: "Synthetic FAQ user",
        password,
      },
    });
    if (isSystemAdmin)
      await database
        .update(user)
        .set({ isSystemAdmin })
        .where(eq(user.id, identity.user.id));
    else
      await database
        .insert(userRoles)
        .values({ roleId, userId: identity.user.id });
    const login = await request(
      "POST",
      "/auth/login",
      { identifier: mobile, password },
      "",
    );
    assert.equal(login.status, 200);
    return ((await login.json()) as { access_token: string }).access_token;
  };

  adminToken = await createIdentity("09120000051", true);
  readerToken = await createIdentity("09120000052", false);
});

beforeEach(async () => {
  await connection.database.delete(faqs);
});

after(() => connection?.client.close());

test("FAQ HTTP operations append, retrieve, update, sort and physically delete entries", async () => {
  assert.deepEqual(await listFaqs(), []);
  const emptySort = await request("PATCH", "/faqs/sort", { ids: [] });
  assert.equal(emptySort.status, 200);
  const first = await createFaq({
    answer: " Synthetic answer. ",
    question: " Synthetic question? ",
  });
  const second = await createFaq({
    answer: "Another answer.",
    question: "Another question?",
  });
  assert.deepEqual(await listFaqs(), [first, second]);

  const path = `/faqs/${first.id}`;
  const details = await request("GET", path, undefined, readerToken);
  assert.equal(details.status, 200);
  assert.deepEqual(await details.json(), first);

  const updated = {
    ...first,
    answer: "Edited answer.",
    question: "Edited question?",
  };
  const update = await request("PATCH", path, {
    answer: updated.answer,
    question: updated.question,
  });
  assert.equal(update.status, 200);
  assert.deepEqual(await update.json(), updated);
  assert.deepEqual(await listFaqs(), [updated, second]);

  const sorted = await request("PATCH", "/faqs/sort", {
    ids: [second.id, first.id],
  });
  assert.equal(sorted.status, 200);
  assert.equal(await sorted.text(), "");
  const third = await createFaq({
    answer: "Last answer.",
    question: "Last question?",
  });
  assert.deepEqual(await listFaqs(), [second, updated, third]);

  const deleted = await request("DELETE", path);
  assert.equal(deleted.status, 200);
  assert.equal(await deleted.text(), "");
  for (const method of ["GET", "PATCH", "DELETE"]) {
    const missing = await request(
      method,
      path,
      method === "PATCH" ? example : undefined,
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      message: "The FAQ does not exist.",
    });
  }
  assert.deepEqual(await listFaqs(), [second, third]);
  const stored = await connection.database
    .select()
    .from(faqs)
    .where(eq(faqs.id, first.id));
  assert.deepEqual(stored, []);
});

test("FAQ routes authorize access before parsing or changing data", async () => {
  const first = await createFaq();
  for (const path of ["/faqs", `/faqs/${first.id}`])
    assert.equal((await request("GET", path, undefined, "")).status, 401);

  for (const [method, path] of [
    ["POST", "/faqs"],
    ["PATCH", "/faqs/sort"],
    ["PATCH", `/faqs/${first.id}`],
    ["DELETE", `/faqs/${first.id}`],
  ]) {
    assert.equal((await request(method, path, undefined, "")).status, 401);
    assert.equal(
      (await request(method, path, undefined, readerToken)).status,
      403,
    );
  }
  assert.deepEqual(await listFaqs(), [first]);
});

test("FAQ validation rejects malformed text and invalid or stale orders without saving changes", async (context) => {
  const faq = await createFaq({
    answer: "a".repeat(faqAnswerMaxLength),
    question: "q".repeat(faqQuestionMaxLength),
  });
  const second = await createFaq();

  for (const input of [
    { ...example, question: "   " },
    { ...example, question: "q".repeat(faqQuestionMaxLength + 1) },
    { ...example, answer: null },
    { ...example, answer: "a".repeat(faqAnswerMaxLength + 1) },
  ]) {
    assert.equal((await request("POST", "/faqs", input)).status, 400);
    assert.equal(
      (await request("PATCH", `/faqs/${faq.id}`, input)).status,
      400,
    );
  }
  for (const ids of [
    undefined,
    "not-an-array",
    [null],
    [" "],
    [faq.id, faq.id],
  ])
    assert.equal((await request("PATCH", "/faqs/sort", { ids })).status, 400);

  const { database } = connection;
  context.after(async () => {
    await database
      .update(settings)
      .set({ languageCode: "en" })
      .where(eq(settings.id, 1));
  });
  await database
    .update(settings)
    .set({ languageCode: "fa" })
    .where(eq(settings.id, 1));
  for (const ids of [
    [],
    [faq.id],
    [second.id, "missing-faq"],
    [second.id, faq.id, "missing-faq"],
  ]) {
    const response = await request("PATCH", "/faqs/sort", { ids });
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("content-language"), "fa");
    assert.deepEqual(await response.json(), {
      message: getTranslator("fa")("faqOrderChanged"),
    });
  }
  assert.deepEqual(await listFaqs(), [faq, second]);
});

test("FAQ sorting rolls back earlier writes if a later position update fails", async (context) => {
  const first = await createFaq();
  const second = await createFaq();
  const { client, database } = connection;
  const readPositions = () =>
    database
      .select({ id: faqs.id, position: faqs.position })
      .from(faqs)
      .orderBy(faqs.id);
  const previous = await readPositions();
  await client.execute(`
    CREATE TRIGGER reject_faq_position BEFORE UPDATE OF position ON faqs
    WHEN OLD.position = 1
    BEGIN SELECT RAISE(ABORT, 'simulated FAQ write failure'); END;
  `);
  context.after(async () => {
    await client.execute("DROP TRIGGER reject_faq_position");
  });

  const response = await request("PATCH", "/faqs/sort", {
    ids: [second.id, first.id],
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    message: "Internal server error.",
  });
  assert.deepEqual(await readPositions(), previous);
  assert.deepEqual(await listFaqs(), [first, second]);
});
