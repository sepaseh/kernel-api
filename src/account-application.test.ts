import assert from "node:assert/strict";
import { test } from "node:test";

import { createAccountService } from "./application/account.ts";
import type { Actor } from "./application/models.ts";
import type { AccountPersistence } from "./application/ports/account.ts";
import type { OtpGateway } from "./application/ports/auth.ts";
import { permissionKeys } from "./contracts/permissions.ts";

const actor: Actor = {
  account: {
    authEmail: "09120000001@kernel.local",
    firstName: "Synthetic",
    id: "account-1",
    isSystemAdmin: false,
    lastName: "User",
    mobile: "09120000001",
    name: "Synthetic User",
    profileEmail: "profile@example.com",
    status: "active",
    username: "synthetic.user",
  },
  permissions: [],
  session: {
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date("2099-01-01"),
    id: "session-1",
    token: "synthetic-token",
    userId: "account-1",
  },
};

const fixture = () => {
  const persistence: AccountPersistence = {
    getPermissions: async () => ["users.read"],
    updateProfile: async (current) => current,
    updateUsername: async (_id, username) => ({ ...actor.account, username }),
    verifyEmail: async () => {},
  };
  const otp: OtpGateway = {
    consume: async () => {},
    issue: async () => ({ expires_in: 120, remaining_seconds: 120 }),
    prepare: (destination, purpose, value, subject) => ({
      destination,
      purpose,
      subject,
      valueHash: `synthetic:${value}`,
    }),
  };
  return { otp, persistence };
};

test("account serialization exposes profile fields and current permissions without authentication identity", async () => {
  const dependencies = fixture();
  let permissionReads = 0;
  dependencies.persistence.getPermissions = async (id) => {
    assert.equal(id, actor.account.id);
    permissionReads++;
    return ["roles.read"];
  };

  const service = createAccountService(dependencies);
  const account = await service.getAccount(actor);
  assert.deepEqual(account, {
    email: actor.account.profileEmail,
    first_name: actor.account.firstName,
    id: actor.account.id,
    is_system_admin: false,
    last_name: actor.account.lastName,
    mobile: actor.account.mobile,
    permissions: ["roles.read"],
    status: "active",
    username: actor.account.username,
  });
  const admin = await service.getAccount({
    ...actor,
    account: { ...actor.account, isSystemAdmin: true },
  });
  assert.deepEqual(admin.permissions, permissionKeys);
  assert.notEqual(admin.permissions, permissionKeys);
  assert.equal(permissionReads, 1);
});

test("username updates validate before persistence and normalize the accepted value", async () => {
  const dependencies = fixture();
  const writes: string[] = [];
  dependencies.persistence.updateUsername = async (id, username) => {
    assert.equal(id, actor.account.id);
    writes.push(username);
    return { ...actor.account, username };
  };
  const service = createAccountService(dependencies);

  for (const username of ["ab", "has space", "non@name", "a".repeat(31)]) {
    await assert.rejects(service.updateUsername(actor, { username }), {
      key: "usernameInvalid",
      kind: "invalid",
    });
  }
  await assert.rejects(service.updateUsername(actor, {}), {
    key: "fieldRequired",
  });
  assert.deepEqual(writes, []);
  const account = await service.updateUsername(actor, {
    username: "  Mixed.Name-1_2  ",
  });
  assert.deepEqual(writes, ["mixed.name-1_2"]);
  assert.equal(account.username, "mixed.name-1_2");
});

test("email verification requests normalize and bind their destination to the account", async () => {
  const dependencies = fixture();
  const issued: unknown[] = [];
  dependencies.otp.issue = async (...input) => {
    issued.push(input);
    return { expires_in: 90, remaining_seconds: 60 };
  };
  const service = createAccountService(dependencies);

  for (const email of ["invalid", "a@b", "a b@example.com"]) {
    await assert.rejects(service.requestEmailVerification(actor, { email }), {
      key: "emailInvalid",
      kind: "invalid",
    });
  }
  assert.deepEqual(issued, []);
  const result = await service.requestEmailVerification(actor, {
    email: "  PROFILE@EXAMPLE.COM ",
  });
  assert.deepEqual(issued, [
    ["profile@example.com", "verify_email", actor.account.id],
  ]);
  assert.deepEqual(result, { expires_in: 90, remaining_seconds: 60 });
});

test("verification never writes the email before OTP consumption succeeds", async () => {
  const dependencies = fixture();
  const effects: string[] = [];
  const failure = new Error("Synthetic OTP rejection");
  dependencies.otp.consume = async () => {
    effects.push("consume");
    throw failure;
  };
  dependencies.persistence.verifyEmail = async () => {
    effects.push("write");
  };
  const service = createAccountService(dependencies);
  const input = { email: "profile@example.com", otp: "123456" };

  await assert.rejects(
    service.verifyEmail(actor, input),
    (error) => error === failure,
  );
  assert.deepEqual(effects, ["consume"]);
  effects.length = 0;
  dependencies.otp.consume = async () => {
    effects.push("consume");
  };
  await service.verifyEmail(actor, input);
  assert.deepEqual(effects, ["consume", "write"]);
});
