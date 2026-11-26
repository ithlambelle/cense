// Created with Claude Code (2026-11-26). The emailed sign-in code's shape, one
// source for the code box and both verify routes: 6 or 8 digits. Supabase
// sends 6 today (otp_length); accepting 8 too lets the hosted setting be
// raised to 8 without breaking sign-in (README, "Supabase Auth settings").
// The per-code limit (auth_code_check) never looks at the code itself.
export const EMAIL_CODE_MAX_LENGTH = 8;
export const EMAIL_CODE_PATTERN = /^(?:\d{6}|\d{8})$/;

export function isEmailCode(value: string): boolean {
  return EMAIL_CODE_PATTERN.test(value);
}
