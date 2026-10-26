export type OtpPurpose =
  "forgot_password" | "login" | "register" | "verify_email";
export type OtpResponse = { expires_in: number; remaining_seconds: number };
