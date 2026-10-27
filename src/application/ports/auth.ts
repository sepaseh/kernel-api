import type { OtpPurpose, OtpResponse } from "../../contracts/otp.ts";
import type { PermissionKey } from "../../contracts/permissions.ts";
import type { Actor, SessionRecord, UserRecord } from "../models.ts";

export type AuthenticationOptions = {
  permission?: PermissionKey;
  systemAdmin?: boolean;
};

export type AuthenticationResult = { token: string; userId: string };

type SignUpInput = {
  authEmail: string;
  firstName: string;
  lastName: string;
  mobile: string;
  name: string;
  password: string;
};

// The provider rejected a credential request. Infrastructure failures remain
// ordinary errors so the HTTP boundary returns its generic server response.
export class AuthRejection extends Error {
  constructor() {
    super("Authentication provider rejected the request.");
    this.name = "AuthRejection";
  }
}

export type AuthProvider = {
  getSession: () => Promise<
    { session: SessionRecord; userId: string } | undefined
  >;
  hashPassword: (password: string) => Promise<string>;
  passwordBounds: () => Promise<{ min: number; max: number }>;
  signIn: (
    authEmail: string,
    password: string,
  ) => Promise<AuthenticationResult>;
  signOut: () => Promise<void>;
  signUp: (input: SignUpInput) => Promise<AuthenticationResult>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
};

export type OtpAttempt = {
  destination: string;
  legacyValueHash?: string;
  purpose: OtpPurpose;
  subject?: string;
  valueHash: string;
};

export type OtpGateway = {
  consume: (attempt: OtpAttempt) => Promise<void>;
  issue: (
    destination: string,
    purpose: OtpPurpose,
    subject?: string,
  ) => Promise<OtpResponse>;
  prepare: (
    destination: string,
    purpose: OtpPurpose,
    value: string,
    subject?: string,
  ) => OtpAttempt;
};

export type AuthPersistence = {
  changePassword: (input: {
    actor: Actor;
    credentialId: string;
    expectedHash: string;
    newHash: string;
  }) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  findCredential: (
    userId: string,
  ) => Promise<{ id: string; hash: string } | undefined>;
  findUserById: (id: string) => Promise<UserRecord | undefined>;
  findUserByMobile: (mobile: string) => Promise<UserRecord | undefined>;
  getPermissions: (userId: string) => Promise<PermissionKey[]>;
  resetPasswordWithOtp: (input: {
    userId: string;
    newHash: string;
    otp: OtpAttempt;
  }) => Promise<void>;
};
