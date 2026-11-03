export type OtpPurpose =
  "change_mobile" | "forgot_password" | "login" | "register" | "verify_email";
export type OtpResponse = { expires_in: number; remaining_seconds: number };
