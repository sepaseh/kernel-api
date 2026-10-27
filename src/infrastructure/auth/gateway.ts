import { isAPIError } from "better-auth/api";

import { ApplicationError } from "../../application/errors.ts";
import {
  type AuthenticationResult,
  type AuthProvider,
  AuthRejection,
} from "../../application/ports/auth.ts";
import type { Auth } from "./better-auth.ts";

export const createAuthGateway = (auth: Auth, headers?: Headers) => {
  const cookies: string[] = [];
  const capture = (responseHeaders: Headers) => {
    if (headers !== undefined) cookies.push(...responseHeaders.getSetCookie());
  };
  const result = (
    userId: string,
    responseHeaders: Headers,
  ): AuthenticationResult => {
    const token = responseHeaders.get("set-auth-token");
    if (!token) throw new ApplicationError("internal", "tokenNotIssued");
    capture(responseHeaders);
    return { token, userId };
  };
  const reject = (error: unknown): never => {
    if (isAPIError(error) && error.statusCode >= 400 && error.statusCode < 500)
      throw new AuthRejection();
    throw error;
  };

  const provider: AuthProvider = {
    async getSession() {
      const current = await auth.api.getSession({
        headers: headers ?? new Headers(),
      });
      if (!current) return undefined;
      return {
        session: {
          createdAt: current.session.createdAt,
          expiresAt: current.session.expiresAt,
          id: current.session.id,
          token: current.session.token,
          userId: current.session.userId,
        },
        userId: current.user.id,
      };
    },
    async hashPassword(password) {
      return (await auth.$context).password.hash(password);
    },
    async passwordBounds() {
      const { config } = (await auth.$context).password;
      return { max: config.maxPasswordLength, min: config.minPasswordLength };
    },
    async signIn(email, password) {
      try {
        const response = await auth.api.signInEmail({
          body: { email, password },
          headers,
          returnHeaders: true,
        });
        return result(response.response.user.id, response.headers);
      } catch (error) {
        return reject(error);
      }
    },
    async signOut() {
      const response = await auth.api.signOut({
        headers: headers ?? new Headers(),
        returnHeaders: true,
      });
      capture(response.headers);
    },
    async signUp(input) {
      try {
        const response = await auth.api.signUpEmail({
          body: {
            email: input.authEmail,
            firstName: input.firstName,
            lastName: input.lastName,
            mobile: input.mobile,
            name: input.name,
            password: input.password,
          },
          headers,
          returnHeaders: true,
        });
        return result(response.response.user.id, response.headers);
      } catch (error) {
        return reject(error);
      }
    },
    async verifyPassword(password, hash) {
      return (await auth.$context).password.verify({ hash, password });
    },
  };

  return { provider, responseCookies: () => [...cookies] };
};
