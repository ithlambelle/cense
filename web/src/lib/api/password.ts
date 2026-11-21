import { z } from "zod";

export const passwordCredentialsSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(8).max(72).refine((value) => new TextEncoder().encode(value).length <= 72, "Use a password of 72 bytes or fewer."),
});

export const passwordSignInSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1),
});

export const passwordResetRequestSchema = z.strictObject({ email: z.email().max(254) });
// Opening a reset link (POST /auth/password/reset/verify): the reset email's
// token_hash (supabase/templates/recovery.html), or the code from Supabase's
// own link, which works only in the browser that asked for it.
export const resetLinkSchema = z.union([
  z.strictObject({ tokenHash: z.string().min(1).max(512) }),
  z.strictObject({ code: z.string().min(1).max(512) }),
]);

export const passwordUpdateSchema = z.strictObject({ password: passwordCredentialsSchema.shape.password });

// Confirms a password sign-up: the emailed code, and the password chosen on the
// sign-up screen, which is set once the code proves the inbox.
export const passwordSignUpConfirmSchema = z.strictObject({
  email: z.email().max(254),
  code: z.string().regex(/^\d{6}$/),
  password: passwordCredentialsSchema.shape.password,
});

export function authCallbackUrl(origin: string, next: string): string {
  const callback = new URL("/api/v1/auth/callback", origin);
  callback.searchParams.set("next", next);
  return callback.toString();
}

// How long a reset link's session can set a new password: the 10 minutes the
// link itself lasts (otp_expiry in supabase/config.toml).
export const RESET_SESSION_SECONDS = 600;

// True when this session came from opening a password reset link in the last
// 10 minutes. Supabase marks a session from its own reset link (it works only in the
// browser that asked) "recovery", and one from the app's token_hash link (any
// browser, supabase/templates/recovery.html) "otp", the same as an email code.
// So an "otp" session counts only if it began at or after the account's latest
// reset email (recovery_sent_at): an ordinary email-code session from before
// the reset was asked for cannot set a password here.
export function openedResetLink(amr: unknown, recoverySentAt: string | null | undefined, nowSeconds: number): boolean {
  if (!Array.isArray(amr)) return false;
  const sentAt = recoverySentAt ? Math.floor(Date.parse(recoverySentAt) / 1000) : Number.NaN;
  return amr.some((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("method" in entry) || !("timestamp" in entry)) return false;
    const { method, timestamp } = entry;
    if (typeof timestamp !== "number" || nowSeconds - timestamp > RESET_SESSION_SECONDS) return false;
    if (method === "recovery") return true;
    return method === "otp" && Number.isFinite(sentAt) && timestamp >= sentAt;
  });
}
