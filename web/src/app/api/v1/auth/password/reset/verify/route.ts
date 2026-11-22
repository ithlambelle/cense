import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { resetLinkSchema } from "@/lib/api/password";
import { authThrottle } from "@/lib/auth/throttle";
import { ROUTES } from "@/lib/routes";
import { createDeferredStudentClient, createStudentClient } from "@/lib/supabase/server";

// The password reset link (external audit of a8fe7d4, login CSRF).
//
// GET verifies nothing. Opening a link must never sign anyone in: someone can
// ask for a reset of their own account and send the link to a student, whose
// one click would then swap them into that account, and a mail scanner that
// opens links would use the link up. GET only forwards to the confirm screen
// (/reset-password/confirm); reset emails now link there directly, and this
// keeps links sent before that change working.
//
// POST, from that screen's Continue button, verifies the link. If a different
// student is signed in in this browser, it refuses and leaves their session
// alone: they are told to log out first. If it cannot tell who is signed in
// (anything but "no session"), it refuses too, before the link is used.
//
// What this cannot stop: a student who is NOT signed in and taps Continue on
// a link someone else sent is signed in to that person's account, as with
// any link that signs in. The guard then is Set a new password, which names
// the account's email, so they can see it is not theirs before typing a
// password.
export function GET(request: NextRequest): Response {
  const target = new URL(ROUTES.resetPasswordConfirm, request.nextUrl.origin);
  for (const name of ["token_hash", "code"]) {
    const value = request.nextUrl.searchParams.get(name);
    if (value) target.searchParams.set(name, value);
  }
  return Response.redirect(target, 303);
}

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  const parsed = resetLinkSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const limited = await authThrottle(request, "link", null);
  if (limited) return limited;

  // Who is signed in now, if anyone. src/proxy.ts has already refreshed the
  // session. Only "no session" counts as signed out: any other failure (Auth
  // down, a token it rejects) could hide a signed-in student, whose session
  // must not be replaced.
  const { data: current, error: currentError } = await (await createStudentClient()).auth.getUser();
  if (currentError && !isAuthSessionMissingError(currentError)) {
    console.error("Checking the current session failed", { code: currentError.code, status: currentError.status });
    return apiError(503, "session_check_failed", "We couldn’t check who’s logged in here. Try again in a minute.");
  }
  const signedInAs = current.user?.id ?? null;

  // The link's session is held back until it is known whose it is.
  const { client, commit } = await createDeferredStudentClient();
  const { data, error } = "tokenHash" in parsed.data
    ? await client.auth.verifyOtp({ token_hash: parsed.data.tokenHash, type: "recovery" })
    : await client.auth.exchangeCodeForSession(parsed.data.code);
  if (error || !data.user) {
    return apiError(401, "invalid_link", "That link has expired or was already used. Ask for a new one.");
  }

  if (signedInAs && signedInAs !== data.user.id) {
    // The link's own session is ended and never reaches the browser.
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) console.error("Ending the unused reset session failed", { code: signOutError.code, status: signOutError.status });
    return apiError(409, "signed_in_as_other", "You’re logged in to a different account. Log out, then ask for a new reset link.");
  }

  commit();
  return Response.json({ status: "verified" }, { headers: noStore });
}
