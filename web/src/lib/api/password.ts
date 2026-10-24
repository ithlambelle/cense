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
