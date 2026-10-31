import assert from "node:assert/strict";
import { test } from "node:test";

import { ApplicationError } from "../../application/errors.ts";
import type { AuthProvider } from "../../application/ports/auth.ts";
import type { Auth } from "./better-auth.ts";
import { createAuthGateway } from "./gateway.ts";

const input: Parameters<AuthProvider["signUp"]>[0] = {
  authEmail: "09120000000@kernel.local",
  firstName: "Synthetic",
  lastName: "User",
  mobile: "09120000000",
  name: "Synthetic User",
  password: "synthetic-password",
};

const stubAuth = (issueToken = true) => {
  let registrations = 0;
  const signOutCookie =
    "better-auth.session_token=; Path=/; HttpOnly; Max-Age=0";
  const registrationCookies: string[] = [];
  // Only the provider endpoints under test are supplied at this external boundary.
  const auth = {
    api: {
      async signOut() {
        return { headers: new Headers({ "Set-Cookie": signOutCookie }) };
      },
      async signUpEmail() {
        registrations++;
        const token = `synthetic-token-${registrations}`;
        const cookie = `better-auth.session_token=${token}; Path=/; HttpOnly`;
        registrationCookies.push(cookie);
        return {
          headers: new Headers({
            ...(issueToken && { "set-auth-token": token }),
            "Set-Cookie": cookie,
          }),
          response: { user: { id: `synthetic-user-${registrations}` } },
        };
      },
    },
  } as unknown as Auth;
  return { auth, registrationCookies, signOutCookie };
};

test("the reusable management provider does not retain cookies from repeated registrations", async () => {
  const { auth } = stubAuth();
  const gateway = createAuthGateway(auth);
  for (let index = 1; index <= 10; index++) {
    const result = await gateway.provider.signUp(input);
    assert.deepEqual(result, {
      token: `synthetic-token-${index}`,
      userId: `synthetic-user-${index}`,
    });
    assert.deepEqual(gateway.responseCookies(), []);
  }
});

test("request-bound providers retain official registration and logout cookies", async () => {
  const { auth, registrationCookies, signOutCookie } = stubAuth();
  const gateway = createAuthGateway(auth, new Headers());
  await gateway.provider.signUp(input);
  await gateway.provider.signOut();
  assert.deepEqual(gateway.responseCookies(), [
    ...registrationCookies,
    signOutCookie,
  ]);
});

test("management registration still requires the provider to issue its token", async () => {
  const { auth } = stubAuth(false);
  const gateway = createAuthGateway(auth);
  await assert.rejects(
    gateway.provider.signUp(input),
    (error: unknown) =>
      error instanceof ApplicationError &&
      error.kind === "internal" &&
      error.key === "tokenNotIssued",
  );
  assert.deepEqual(gateway.responseCookies(), []);
});
