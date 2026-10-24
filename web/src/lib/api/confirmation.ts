import { randomBytes } from "node:crypto";

import type { User } from "@supabase/supabase-js";

// Supabase stamps the confirmation and the sign-in in the same request, a few
// milliseconds apart, when this code is what confirms the account. On an
// account confirmed earlier the two are at least as far apart as it takes to
// get and type a new code.
const SAME_REQUEST_MS = 5_000;

export function confirmedByThisCode(user: Pick<User, "email_confirmed_at" | "last_sign_in_at"> | null): boolean {
  if (!user?.email_confirmed_at || !user.last_sign_in_at) return false;
  const gap = Date.parse(user.last_sign_in_at) - Date.parse(user.email_confirmed_at);
  return Number.isFinite(gap) && gap >= 0 && gap < SAME_REQUEST_MS;
}

// 256 random bits, plus one character of each kind in case the project
// requires them. Nobody ever sees it: the student signs in with a code, Google
// or Forgot password.
export function unusablePassword(): string {
  return `${randomBytes(32).toString("base64url")}Aa1!`;
}
