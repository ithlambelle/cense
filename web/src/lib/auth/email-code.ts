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

// Supabase's own rate limit on code checks counts by IP, and the app calls it
// from Vercel's addresses, shared by every student: a refusal there is a busy
// moment, not this student's guessing, and costs them no try.
export const CODE_CHECK_BUSY_MESSAGE = "Too many sign-ins right now. Try again in a minute.";
