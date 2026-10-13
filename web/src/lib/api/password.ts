import { z } from "zod";

export const passwordCredentialsSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

export const passwordSignInSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1),
});

export const passwordResetRequestSchema = z.strictObject({ email: z.email().max(254) });
export const passwordUpdateSchema = z.strictObject({ password: z.string().min(8).max(128) });

export function authCallbackUrl(origin: string, next: string): string {
  const callback = new URL("/api/v1/auth/callback", origin);
  callback.searchParams.set("next", next);
  return callback.toString();
}
