export type AccessTokenResponse = { access_token: string };

export type LoginRequest = { password: string } & (
  | { identifier: string; mobile?: string }
  | { identifier?: never; mobile: string }
);
