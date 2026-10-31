import assert from "node:assert/strict";
import { test } from "node:test";

import { permissionKeys } from "../contracts/permissions.ts";
import { profileNameMaxLength } from "../contracts/profile.ts";
import { createAccountService } from "./account.ts";
import { createAuthService } from "./auth.ts";
import { ApplicationError } from "./errors.ts";
import type { Actor, UserRecord } from "./models.ts";
import type { AccountPersistence } from "./ports/account.ts";
import {
  type AuthPersistence,
  type AuthProvider,
  AuthRejection,
  type OtpGateway,
} from "./ports/auth.ts";

const account: UserRecord = {
  authEmail: "09120000000@kernel.local",
  firstName: "Test",
  id: "user-1",
  isSystemAdmin: false,
  lastName: "User",
  mobile: "09120000000",
  name: "Test User",
  status: "active",
};
const actor: Actor = {
  account,
  permissions: ["users.read"],
  session: {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    id: "session-1",
    token: "synthetic-session-token",
    userId: account.id,
  },
};

const fixture = () => {
  const provider: AuthProvider = {
    getSession: async () => ({ session: actor.session, userId: account.id }),
    hashPassword: async (password) => `hash:${password}`,
    passwordBounds: async () => ({ max: 128, min: 8 }),
    signIn: async () => ({ token: actor.session.token, userId: account.id }),
    signOut: async () => {},
    signUp: async () => ({ token: actor.session.token, userId: account.id }),
    verifyPassword: async () => true,
  };
  const persistence: AuthPersistence = {
    changePassword: async () => {},
    deleteSession: async () => {},
    findCredential: async () => ({ hash: "old-hash", id: "credential-1" }),
    findUserById: async () => account,
    findUserByMobile: async () => account,
    getPermissions: async () => ["users.read"],
    resetPasswordWithOtp: async () => {},
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
  return { otp, persistence, provider };
};

test("profile names share registration bounds without clearing omitted or blank fields", async () => {
  const dependencies = fixture();
  const writes: Array<{ firstName?: string; lastName?: string }> = [];
  const persistence: AccountPersistence = {
    getPermissions: dependencies.persistence.getPermissions,
    updateProfile: async (current, update) => {
      writes.push(update);
      return {
        ...current,
        ...Object.fromEntries(
          Object.entries(update).filter(([, value]) => value !== undefined),
        ),
      };
    },
    updateUsername: async () => account,
    verifyEmail: async () => {},
  };
  const service = createAccountService({ otp: dependencies.otp, persistence });
  const boundary = "ن".repeat(profileNameMaxLength);
  const result = await service.updateProfile(actor, {
    first_name: ` ${boundary} `,
    last_name: "  ",
  });
  assert.equal(result.first_name, boundary);
  assert.equal(result.last_name, account.lastName);
  assert.deepEqual(writes, [{ firstName: boundary, lastName: undefined }]);
  await service.updateProfile(actor, { last_name: " Replacement " });
  assert.deepEqual(writes[1], {
    firstName: undefined,
    lastName: "Replacement",
  });
  for (const input of [{}, { first_name: " " }, { ignored: "value" }]) {
    await assert.rejects(service.updateProfile(actor, input), {
      key: "profileFieldsRequired",
    });
  }
  assert.equal(writes.length, 2);
});

test("profile rejects either malformed or oversized name before any partial write", async () => {
  const dependencies = fixture();
  let writes = 0;
  const service = createAccountService({
    otp: dependencies.otp,
    persistence: {
      getPermissions: dependencies.persistence.getPermissions,
      updateProfile: async () => {
        writes++;
        return account;
      },
      updateUsername: async () => account,
      verifyEmail: async () => {},
    },
  });
  for (const field of ["first_name", "last_name"]) {
    for (const value of [
      null,
      1,
      false,
      [],
      {},
      "x".repeat(profileNameMaxLength + 1),
    ]) {
      await assert.rejects(
        service.updateProfile(actor, {
          first_name: "Valid",
          last_name: "Valid",
          [field]: value,
        }),
        {
          key: "fieldInvalid",
          kind: "invalid",
          values: { field },
        },
      );
    }
  }
  assert.equal(writes, 0);
});

test("registration uses a fresh authentication identity independent of mobile", async () => {
  const dependencies = fixture();
  const identities: string[] = [];
  dependencies.provider.signUp = async (input) => {
    identities.push(input.authEmail);
    return { token: "synthetic-token", userId: account.id };
  };
  const service = createAuthService(dependencies);
  const input = {
    first_name: "New",
    last_name: "User",
    mobile: account.mobile,
    otp: "123456",
    password: "synthetic-password",
  };
  await service.register(input);
  await service.register(input);
  assert.equal(identities.length, 2);
  assert.match(identities[0]!, /^[0-9a-f-]{36}@kernel\.local$/);
  assert.notEqual(identities[0], identities[1]);
});

test("registration validates bounded names before OTP consumption or provider writes", async () => {
  const dependencies = fixture();
  let consumed = 0;
  let created = 0;
  dependencies.otp.consume = async () => {
    consumed++;
  };
  dependencies.provider.signUp = async (input) => {
    created++;
    assert.equal(input.firstName, "x".repeat(profileNameMaxLength));
    assert.equal(input.lastName, "y".repeat(profileNameMaxLength));
    return { token: "synthetic-token", userId: account.id };
  };
  const service = createAuthService(dependencies);
  const input = {
    first_name: "New",
    last_name: "User",
    mobile: account.mobile,
    otp: "123456",
    password: "synthetic-password",
  };
  for (const field of ["first_name", "last_name"]) {
    for (const value of [null, 1, " ", "x".repeat(profileNameMaxLength + 1)]) {
      await assert.rejects(
        service.register({ ...input, [field]: value }),
        (error: unknown) =>
          error instanceof ApplicationError && error.kind === "invalid",
      );
    }
  }
  assert.equal(consumed, 0);
  assert.equal(created, 0);
  await service.register({
    ...input,
    first_name: ` ${"x".repeat(profileNameMaxLength)} `,
    last_name: "y".repeat(profileNameMaxLength),
  });
  assert.equal(consumed, 1);
  assert.equal(created, 1);
});

test("registration rejects a short password without spending the OTP", async () => {
  const dependencies = fixture();
  let consumed = false;
  let signedUp = false;
  dependencies.otp.consume = async () => {
    consumed = true;
  };
  dependencies.provider.signUp = async () => {
    signedUp = true;
    return { token: "unused", userId: "unused" };
  };
  await assert.rejects(
    createAuthService(dependencies).register({
      first_name: "New",
      last_name: "User",
      mobile: account.mobile,
      otp: "123456",
      password: "short",
    }),
    (error: unknown) =>
      error instanceof ApplicationError && error.key === "registrationInvalid",
  );
  assert.equal(consumed, false);
  assert.equal(signedUp, false);
});

test("authentication rechecks active status and current permissions", async () => {
  const dependencies = fixture();
  dependencies.persistence.findUserById = async () => ({
    ...account,
    status: "inactive",
  });
  const service = createAuthService(dependencies);
  await assert.rejects(
    service.authenticate(),
    (error: unknown) =>
      error instanceof ApplicationError && error.kind === "unauthenticated",
  );
  dependencies.persistence.findUserById = async () => account;
  dependencies.persistence.getPermissions = async () => [];
  await assert.rejects(
    service.authenticate({ permission: "users.read" }),
    (error: unknown) =>
      error instanceof ApplicationError && error.key === "permissionDenied",
  );
});

test("credential rejection stays a client error while provider outages propagate", async () => {
  const dependencies = fixture();
  dependencies.provider.signIn = async () => {
    throw new AuthRejection();
  };
  const service = createAuthService(dependencies);
  const input = { identifier: account.mobile, password: "synthetic-password" };
  await assert.rejects(
    service.login(input),
    (error: unknown) =>
      error instanceof ApplicationError && error.key === "invalidCredentials",
  );
  const outage = new Error("Synthetic provider outage");
  dependencies.provider.signIn = async () => {
    throw outage;
  };
  await assert.rejects(
    service.login(input),
    (error: unknown) => error === outage,
  );
});

test("password changes clear provider cookies only after persistence commits", async () => {
  const dependencies = fixture();
  let signedOut = false;
  dependencies.provider.signOut = async () => {
    signedOut = true;
  };
  const failure = new Error("Synthetic transaction rollback");
  dependencies.persistence.changePassword = async () => {
    throw failure;
  };
  const service = createAuthService(dependencies);
  const input = {
    current_password: "original-password",
    new_password: "replacement-password",
  };
  await assert.rejects(
    service.changePassword(actor, input),
    (error: unknown) => error === failure,
  );
  assert.equal(signedOut, false);
  dependencies.persistence.changePassword = async (change) => {
    assert.equal(change.expectedHash, "old-hash");
    assert.equal(change.newHash, "hash:replacement-password");
  };
  await service.changePassword(actor, input);
  assert.equal(signedOut, true);
});

test("recovery passes OTP and new hash together to the atomic persistence operation", async () => {
  const dependencies = fixture();
  dependencies.otp.consume = async () => {
    assert.fail("Recovery must consume inside its persistence transaction");
  };
  let reset = false;
  dependencies.persistence.resetPasswordWithOtp = async (change) => {
    assert.equal(change.userId, account.id);
    assert.equal(change.newHash, "hash:replacement-password");
    assert.deepEqual(change.otp, {
      destination: account.mobile,
      purpose: "forgot_password",
      subject: undefined,
      valueHash: "synthetic:123456",
    });
    reset = true;
  };
  await createAuthService(dependencies).forgotPassword({
    mobile: account.mobile,
    otp: "123456",
    password: "replacement-password",
  });
  assert.equal(reset, true);
});

test("email verification binds its OTP to the authenticated account", async () => {
  const dependencies = fixture();
  const persistence: AccountPersistence = {
    getPermissions: dependencies.persistence.getPermissions,
    updateProfile: async () => account,
    updateUsername: async () => account,
    verifyEmail: async (userId, email) => {
      assert.equal(userId, account.id);
      assert.equal(email, "test@example.com");
    },
  };
  let consumed = false;
  dependencies.otp.consume = async (attempt) => {
    assert.equal(attempt.subject, account.id);
    assert.equal(attempt.destination, "test@example.com");
    assert.equal(attempt.purpose, "verify_email");
    consumed = true;
  };
  const service = createAccountService({ otp: dependencies.otp, persistence });
  await service.verifyEmail(actor, {
    email: "TEST@EXAMPLE.COM",
    otp: "123456",
  });
  assert.equal(consumed, true);
  const result = await service.getAccount(actor);
  assert.equal(result.email, undefined);
  assert.equal("authEmail" in result, false);
  assert.deepEqual(result.permissions, ["users.read"]);
});

test("authentication requires a current account and grants system administrators canonical permissions", async () => {
  const dependencies = fixture();
  const service = createAuthService(dependencies);
  dependencies.provider.getSession = async () => undefined;

  await assert.rejects(service.authenticate(), {
    key: "authenticationRequired",
    kind: "unauthenticated",
  });
  dependencies.provider.getSession = async () => ({
    session: actor.session,
    userId: account.id,
  });
  dependencies.persistence.findUserById = async () => undefined;
  await assert.rejects(service.authenticate(), {
    key: "authenticationRequired",
    kind: "unauthenticated",
  });
  dependencies.persistence.findUserById = async () => account;
  await assert.rejects(service.authenticate({ systemAdmin: true }), {
    key: "systemAdminRequired",
    kind: "forbidden",
  });
  dependencies.persistence.findUserById = async () => ({
    ...account,
    isSystemAdmin: true,
  });
  dependencies.persistence.getPermissions = async () => {
    assert.fail(
      "Administrator permissions must come from the canonical vocabulary",
    );
  };
  const authenticated = await service.authenticate({
    permission: "settings.update",
    systemAdmin: true,
  });
  assert.deepEqual(authenticated.permissions, permissionKeys);
  assert.equal(authenticated.session, actor.session);
});

test("OTP requests validate mobile and purpose before delivery", async () => {
  const dependencies = fixture();
  const issues: unknown[] = [];
  dependencies.otp.issue = async (...input) => {
    issues.push(input);
    return { expires_in: 120, remaining_seconds: 120 };
  };
  const service = createAuthService(dependencies);

  for (const input of [
    { mobile: "invalid", purpose: "login" },
    { mobile: account.mobile, purpose: "unsupported" },
    { mobile: account.mobile },
  ]) {
    await assert.rejects(service.requestOtp(input), {
      key: "invalidMobileOrPurpose",
      kind: "invalid",
    });
  }
  assert.deepEqual(issues, []);
  for (const purpose of [
    "login",
    "register",
    "forgot_password",
    "verify_email",
  ]) {
    await service.requestOtp({ mobile: account.mobile, purpose });
  }
  assert.deepEqual(issues, [
    [account.mobile, "login"],
    [account.mobile, "register"],
    [account.mobile, "forgot_password"],
    [account.mobile, "verify_email"],
  ]);
});

test("logout clears provider state after persistence and propagates failed revocation", async () => {
  const dependencies = fixture();
  const effects: string[] = [];
  dependencies.persistence.deleteSession = async (id) => {
    assert.equal(id, actor.session.id);
    effects.push("revoke");
  };
  dependencies.provider.signOut = async () => {
    effects.push("sign-out");
  };
  const service = createAuthService(dependencies);

  await service.logout();
  assert.deepEqual(effects, ["revoke", "sign-out"]);
  effects.length = 0;
  dependencies.provider.getSession = async () => undefined;
  await service.logout();
  assert.deepEqual(effects, ["sign-out"]);
  effects.length = 0;
  dependencies.provider.getSession = async () => ({
    session: actor.session,
    userId: account.id,
  });
  const failure = new Error("Synthetic revocation failure");
  dependencies.persistence.deleteSession = async () => {
    throw failure;
  };
  await assert.rejects(service.logout(), (error) => error === failure);
  assert.deepEqual(effects, []);
});

test("password change rejects invalid credentials or bounds without writes or cookie changes", async () => {
  const dependencies = fixture();
  let writes = 0;
  dependencies.persistence.changePassword = async () => {
    writes++;
  };
  dependencies.provider.signOut = async () => {
    writes++;
  };
  const service = createAuthService(dependencies);

  await assert.rejects(
    service.changePassword(actor, {
      current_password: "same-password",
      new_password: "same-password",
    }),
    {
      key: "newPasswordDifferent",
      kind: "invalid",
    },
  );
  await assert.rejects(
    service.changePassword(actor, {
      current_password: "old-password",
      new_password: "short",
    }),
    {
      key: "passwordChangeInvalid",
      kind: "invalid",
    },
  );
  const input = {
    current_password: "old-password",
    new_password: "replacement-password",
  };
  dependencies.persistence.findCredential = async () => undefined;
  await assert.rejects(service.changePassword(actor, input), {
    key: "passwordChangeInvalid",
  });
  dependencies.persistence.findCredential = async () => ({
    id: "credential-1",
    hash: "old-hash",
  });
  dependencies.provider.verifyPassword = async () => false;
  await assert.rejects(service.changePassword(actor, input), {
    key: "passwordChangeInvalid",
  });
  assert.equal(writes, 0);
});

test("registration maps credential rejection while preserving provider outages", async () => {
  const dependencies = fixture();
  const service = createAuthService(dependencies);
  const input = {
    first_name: "New",
    last_name: "User",
    mobile: account.mobile,
    otp: "123456",
    password: "synthetic-password",
  };

  await assert.rejects(service.register({ ...input, mobile: "invalid" }), {
    key: "mobileInvalid",
    kind: "invalid",
  });
  dependencies.provider.signUp = async () => {
    throw new AuthRejection();
  };
  await assert.rejects(service.register(input), {
    key: "registrationInvalid",
    kind: "invalid",
  });
  const failure = new Error("Synthetic provider outage");
  dependencies.provider.signUp = async () => {
    throw failure;
  };
  await assert.rejects(service.register(input), (error) => error === failure);
});

test("recovery and login reject missing or inactive identities before provider writes", async () => {
  const dependencies = fixture();
  dependencies.provider.signIn = async () => {
    assert.fail("Invalid identity reached provider");
  };
  const service = createAuthService(dependencies);
  const recovery = {
    mobile: account.mobile,
    otp: "123456",
    password: "replacement-password",
  };

  await assert.rejects(
    service.forgotPassword({ ...recovery, password: "short" }),
    {
      key: "passwordResetInvalid",
      kind: "invalid",
    },
  );
  await assert.rejects(
    service.login({ identifier: "invalid", password: "synthetic-password" }),
    {
      key: "invalidCredentials",
      kind: "invalid",
    },
  );
  dependencies.persistence.findUserByMobile = async () => undefined;
  await assert.rejects(service.forgotPassword(recovery), {
    key: "passwordResetInvalid",
    kind: "invalid",
  });
  await assert.rejects(
    service.login({
      identifier: account.mobile,
      password: "synthetic-password",
    }),
    {
      key: "invalidCredentials",
      kind: "invalid",
    },
  );
  dependencies.persistence.findUserByMobile = async () => ({
    ...account,
    status: "inactive",
  });
  await assert.rejects(
    service.login({
      identifier: account.mobile,
      password: "synthetic-password",
    }),
    {
      key: "invalidCredentials",
      kind: "invalid",
    },
  );
});
