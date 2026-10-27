import assert from "node:assert/strict";
import { test } from "node:test";

import { ApplicationError } from "./application/errors.ts";
import type { Actor, UserRecord } from "./application/models.ts";
import {
  type AuthProvider,
  AuthRejection,
  type OtpGateway,
} from "./application/ports/auth.ts";
import type {
  UsersRepository,
  UsersWritePort,
} from "./application/ports/users.ts";
import { createUsersService } from "./application/users.ts";
import { profileNameMaxLength } from "./contracts/profile.ts";

const unused = async (): Promise<never> => {
  throw new Error("Unexpected adapter operation");
};
const otp: OtpGateway = {
  consume: unused,
  issue: unused,
  prepare: (destination, purpose, value, subject) => ({
    destination,
    purpose,
    valueHash: value,
    subject,
  }),
};
const provider: AuthProvider = {
  getSession: unused,
  hashPassword: unused,
  passwordBounds: unused,
  signIn: unused,
  signOut: unused,
  signUp: unused,
  verifyPassword: unused,
};
const target: UserRecord = {
  authEmail: "09120000002@kernel.local",
  firstName: "Target",
  id: "target",
  isSystemAdmin: false,
  lastName: "User",
  mobile: "09120000002",
  name: "Target User",
  status: "active",
};
const actor: Actor = {
  account: { ...target, id: "actor", isSystemAdmin: true },
  permissions: [],
  session: {
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date("2099-01-01"),
    id: "synthetic-session",
    token: "synthetic-token",
    userId: "actor",
  },
};

test("managed profile updates enforce the same name bound and preserve optional fields", async () => {
  let writes = 0;
  const repository: UsersRepository = {
    deleteSessions: unused,
    find: async () => target,
    getRoles: async () => new Map(),
    list: unused,
    transaction: unused,
    update: async (_id, update) => {
      writes++;
      return { ...target, ...update };
    },
  };
  const service = createUsersService({ provider, repository });
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
        service.update(actor, target.id, {
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
    await assert.rejects(
      service.create({
        first_name: "Valid",
        last_name: "Valid",
        [field]: "x".repeat(profileNameMaxLength + 1),
        mobile: target.mobile,
        password: "synthetic-password",
      }),
      { key: "fieldInvalid" },
    );
  }
  assert.equal(writes, 0);
  const result = await service.update(actor, target.id, {
    first_name: ` ${"ن".repeat(profileNameMaxLength)} `,
    last_name: " ",
  });
  assert.equal(result.first_name.length, profileNameMaxLength);
  assert.equal(result.last_name, target.lastName);
  assert.equal(writes, 1);
});

test("application policy prevents non-admins changing an administrator's mobile", async () => {
  const admin = { ...target, isSystemAdmin: true };
  let writes = 0;
  let liveActor = { ...actor.account, isSystemAdmin: false };
  const transaction: UsersWritePort = {
    countActiveAdmins: unused,
    deleteSessions: unused,
    existingRoleIds: unused,
    find: async (id) => (id === admin.id ? admin : liveActor),
    hasActiveSession: async () => true,
    hasPermission: async () => true,
    consumeOtp: async () => {},
    remove: unused,
    replaceRoles: unused,
    resetCredentialPassword: unused,
    setStatus: unused,
    setSystemAdmin: unused,
    update: async (_id, update) => {
      writes++;
      return { ...admin, ...update };
    },
  };
  const repository: UsersRepository = {
    deleteSessions: unused,
    find: async () => admin,
    getRoles: async () => new Map(),
    list: unused,
    transaction: (work) => work(transaction),
    update: async (_id, update) => {
      writes++;
      return { ...admin, ...update };
    },
  };
  const editor: Actor = {
    ...actor,
    account: { ...actor.account, isSystemAdmin: false },
  };
  const service = createUsersService({ provider, repository, otp });
  await assert.rejects(
    service.update(editor, admin.id, {
      mobile: "09120000003",
      first_name: "Changed",
    }),
    {
      kind: "forbidden",
      key: "systemAdminRequired",
    },
  );
  assert.equal(writes, 0);
  await service.update(editor, admin.id, { first_name: "Changed" });
  assert.equal(writes, 1);
  liveActor = actor.account;
  await service.update(actor, admin.id, {
    mobile: "09120000003",
    otp: "123456",
  });
  assert.equal(writes, 2);
});

for (const operation of ["remove", "deactivate", "demote"] as const) {
  test(`user policy rejects ${operation} after the target becomes the last active admin inside the transaction`, async () => {
    let writes = 0;
    const write = async () => {
      writes++;
    };
    const transaction: UsersWritePort = {
      countActiveAdmins: async () => 1,
      deleteSessions: unused,
      existingRoleIds: unused,
      find: async () => ({ ...target, isSystemAdmin: true }),
      hasActiveSession: unused,
      hasPermission: unused,
      consumeOtp: unused,
      remove: async () => {
        await write();
        return "deleted";
      },
      replaceRoles: unused,
      resetCredentialPassword: unused,
      setStatus: write,
      setSystemAdmin: write,
      update: unused,
    };
    const repository: UsersRepository = {
      deleteSessions: unused,
      find: async () => target,
      getRoles: unused,
      list: unused,
      transaction: (work) => work(transaction),
      update: unused,
    };
    const service = createUsersService({ provider, repository });
    const request =
      operation === "remove"
        ? service.remove(actor, target.id)
        : operation === "deactivate"
          ? service.setStatus(actor, target.id, { status: "inactive" })
          : service.setSystemAdmin(target.id, { is_system_admin: false });
    await assert.rejects(
      request,
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.kind === "conflict" &&
        error.key === "finalAdminDelete",
    );
    assert.equal(writes, 0);
  });
}

const deletionService = (remove: UsersWritePort["remove"]) => {
  const transaction: UsersWritePort = {
    countActiveAdmins: unused,
    deleteSessions: unused,
    existingRoleIds: unused,
    find: async () => target,
    hasActiveSession: unused,
    hasPermission: unused,
    consumeOtp: unused,
    remove,
    replaceRoles: unused,
    resetCredentialPassword: unused,
    setStatus: unused,
    setSystemAdmin: unused,
    update: unused,
  };
  const repository: UsersRepository = {
    deleteSessions: unused,
    find: async () => target,
    getRoles: unused,
    list: unused,
    transaction: (work) => work(transaction),
    update: unused,
  };
  return createUsersService({ provider, repository });
};

test("user deletion reports a referenced record as a domain conflict", async () => {
  const service = deletionService(async () => "in-use");

  await assert.rejects(service.remove(actor, target.id), {
    key: "userInUse",
    kind: "conflict",
  });
});

test("user deletion keeps its self guard ahead of the removal port", async () => {
  const service = deletionService(unused);

  await assert.rejects(
    service.remove({ ...actor, account: target }, target.id),
    { key: "userCannotDeleteSelf", kind: "conflict" },
  );
});

test("user deletion accepts an unused record without masking infrastructure failures", async () => {
  let removals = 0;
  const service = deletionService(async () => {
    removals++;
    return "deleted";
  });

  await service.remove(actor, target.id);
  assert.equal(removals, 1);

  const failure = new Error("synthetic persistence failure");
  const failing = deletionService(async () => {
    throw failure;
  });
  await assert.rejects(
    failing.remove(actor, target.id),
    (error) => error === failure,
  );
});

const managementFixture = () => {
  const transaction: UsersWritePort = {
    countActiveAdmins: unused,
    deleteSessions: unused,
    existingRoleIds: unused,
    find: async (id) => (id === target.id ? target : actor.account),
    hasActiveSession: async () => true,
    hasPermission: async () => true,
    consumeOtp: async () => {},
    remove: unused,
    replaceRoles: unused,
    resetCredentialPassword: unused,
    setStatus: unused,
    setSystemAdmin: unused,
    update: (id, changes, actorId) => repository.update(id, changes, actorId),
  };
  const repository: UsersRepository = {
    deleteSessions: unused,
    find: async () => target,
    getRoles: async () => new Map(),
    list: unused,
    transaction: (work) => work(transaction),
    update: unused,
  };
  const auth = { ...provider };
  const service = createUsersService({ provider: auth, repository, otp });
  return { auth, repository, service, transaction };
};

test("managed user creation normalizes identity and revokes the provider-created session", async () => {
  const { auth, repository, service } = managementFixture();
  const effects: string[] = [];
  auth.signUp = async (input) => {
    assert.match(input.authEmail, /^[0-9a-f-]{36}@kernel\.local$/);
    assert.deepEqual(input, {
      authEmail: input.authEmail,
      firstName: "New",
      lastName: "User",
      mobile: target.mobile,
      name: "New User",
      password: "synthetic-password",
    });
    effects.push("create");
    return { token: "synthetic-provider-token", userId: target.id };
  };
  repository.deleteSessions = async (id) => {
    assert.equal(id, target.id);
    effects.push("revoke");
  };
  repository.find = async (id) => {
    assert.equal(id, target.id);
    effects.push("read");
    return target;
  };
  const input = {
    first_name: " New ",
    last_name: " User ",
    mobile: target.mobile,
    password: "synthetic-password",
  };

  await assert.rejects(service.create({ ...input, mobile: "invalid" }), {
    key: "mobileInvalid",
    kind: "invalid",
  });
  assert.deepEqual(effects, []);
  const result = await service.create(input);
  assert.equal(result.id, target.id);
  assert.equal("token" in result, false);
  assert.deepEqual(effects, ["create", "revoke", "read"]);
  auth.signUp = async () => {
    throw new AuthRejection();
  };
  await assert.rejects(service.create(input), {
    key: "userDataInvalid",
    kind: "invalid",
  });
  const failure = new Error("Synthetic provider outage");
  auth.signUp = async () => {
    throw failure;
  };
  await assert.rejects(service.create(input), (error) => error === failure);
});

test("managed list bounds pagination and attaches each user's own roles", async () => {
  const { repository, service } = managementFixture();
  const queries: Array<Parameters<UsersRepository["list"]>[0]> = [];
  repository.list = async (query) => {
    queries.push(query);
    return { items: [target, { ...target, id: "other" }], total: 8 };
  };
  const roles = [{ id: "reader", name: "Readers" }];
  repository.getRoles = async (ids) => {
    assert.deepEqual(ids, [target.id, "other"]);
    return new Map([[target.id, roles]]);
  };

  const page = await service.list({
    first_name: "Target",
    offset: "24",
    size: "200",
    status: "inactive",
  });
  assert.equal(page.total, 8);
  assert.deepEqual(
    page.items.map(({ roles: value }) => value),
    [roles, []],
  );
  assert.equal(queries[0].size, 100);
  assert.equal(queries[0].offset, 24);
  assert.equal(queries[0].firstName, "Target");
  assert.equal(queries[0].status, "inactive");
  for (const size of [
    "0",
    "-1",
    "1.5",
    "9999999999999999999999999999",
    undefined,
  ]) {
    await service.list({ offset: "bad", size, status: "unknown" });
    assert.equal(queries.at(-1)?.size, 12);
    assert.equal(queries.at(-1)?.offset, 0);
    assert.equal(queries.at(-1)?.status, undefined);
  }
  repository.getRoles = async () => new Map([[target.id, roles]]);
  assert.deepEqual((await service.get(target.id)).roles, roles);
  repository.find = async () => undefined;
  await assert.rejects(service.get(target.id), {
    key: "userNotFound",
    kind: "not-found",
  });
});

test("role replacement validates all referenced roles inside the transaction before replacing assignments", async () => {
  const { service, transaction } = managementFixture();
  const replacements: string[][] = [];
  transaction.existingRoleIds = async () => [];
  transaction.replaceRoles = async (id, roleIds) => {
    assert.equal(id, target.id);
    replacements.push(roleIds);
  };

  for (const role_ids of [undefined, "role-1", [1]]) {
    await assert.rejects(service.replaceRoles(target.id, { role_ids }), {
      key: "userRolesInvalid",
      kind: "invalid",
    });
  }
  await assert.rejects(
    service.replaceRoles(target.id, { role_ids: ["missing"] }),
    {
      key: "roleNotFound",
      kind: "not-found",
    },
  );
  assert.deepEqual(replacements, []);
  transaction.existingRoleIds = async (ids) => ids;
  await service.replaceRoles(target.id, {
    role_ids: ["role-1", "role-1", "role-2"],
  });
  await service.replaceRoles(target.id, { role_ids: [] });
  assert.deepEqual(replacements, [["role-1", "role-2"], []]);
  transaction.find = async () => undefined;
  await assert.rejects(service.replaceRoles(target.id, { role_ids: [] }), {
    key: "userNotFound",
    kind: "not-found",
  });
  assert.equal(replacements.length, 2);
});

test("managed password reset validates bounds and revokes sessions only after credential update", async () => {
  const { auth, service, transaction } = managementFixture();
  const effects: string[] = [];
  auth.passwordBounds = async () => ({ min: 8, max: 20 });
  auth.hashPassword = async (password) => {
    effects.push("hash");
    return `hash:${password}`;
  };
  transaction.resetCredentialPassword = async (id, hash) => {
    assert.equal(id, target.id);
    assert.equal(hash, "hash:replacement-password");
    effects.push("credential");
    return false;
  };
  transaction.deleteSessions = async (id) => {
    assert.equal(id, target.id);
    effects.push("revoke");
  };

  await assert.rejects(
    service.resetPassword(target.id, { password: "short" }),
    {
      key: "passwordTooShort",
      kind: "invalid",
    },
  );
  await assert.rejects(
    service.resetPassword(target.id, { password: "x".repeat(21) }),
    {
      key: "passwordResetInvalid",
      kind: "invalid",
    },
  );
  assert.equal(effects.length, 0);
  await assert.rejects(
    service.resetPassword(target.id, { password: "replacement-password" }),
    {
      key: "credentialAccountNotFound",
      kind: "not-found",
    },
  );
  assert.deepEqual(effects, ["hash", "credential"]);
  effects.length = 0;
  transaction.resetCredentialPassword = async () => {
    effects.push("credential");
    return true;
  };
  await service.resetPassword(target.id, { password: "replacement-password" });
  assert.deepEqual(effects, ["hash", "credential", "revoke"]);
});

test("status and administrator changes reject malformed or self-deactivating requests before writes", async () => {
  const { service, transaction } = managementFixture();
  const statuses: string[] = [];
  const adminFlags: boolean[] = [];
  transaction.setStatus = async (_id, status) => {
    statuses.push(status);
  };
  transaction.setSystemAdmin = async (_id, value) => {
    adminFlags.push(value);
  };

  await assert.rejects(
    service.setStatus(actor, target.id, { status: "deleted" }),
    {
      key: "userStatusInvalid",
      kind: "invalid",
    },
  );
  await assert.rejects(
    service.setStatus({ ...actor, account: target }, target.id, {
      status: "inactive",
    }),
    {
      key: "userCannotDeactivateSelf",
      kind: "conflict",
    },
  );
  await assert.rejects(
    service.setSystemAdmin(target.id, { is_system_admin: "true" }),
    {
      key: "systemAdminInvalid",
      kind: "invalid",
    },
  );
  assert.deepEqual(statuses, []);
  assert.deepEqual(adminFlags, []);
  await service.setStatus(actor, target.id, { status: "active" });
  await service.setStatus(actor, target.id, { status: "inactive" });
  await service.setSystemAdmin(target.id, { is_system_admin: true });
  await service.setSystemAdmin(target.id, { is_system_admin: false });
  assert.deepEqual(statuses, ["active", "inactive"]);
  assert.deepEqual(adminFlags, [true, false]);
});

test("managed profile updates reject no-op changes and handle disappearance during persistence", async () => {
  const { repository, service } = managementFixture();

  await assert.rejects(
    service.update(actor, target.id, { mobile: "invalid" }),
    {
      key: "mobileInvalid",
      kind: "invalid",
    },
  );
  repository.update = async () => undefined;
  await assert.rejects(
    service.update(actor, target.id, { mobile: "09120000003", otp: "123456" }),
    {
      key: "userNotFound",
      kind: "not-found",
    },
  );
  repository.update = async (_id, update) => ({ ...target, ...update });
  const updated = await service.update(actor, target.id, {
    mobile: "09120000003",
    otp: "123456",
  });
  assert.equal(updated.mobile, "09120000003");
  assert.equal(updated.first_name, target.firstName);
  assert.equal(updated.last_name, target.lastName);
});
