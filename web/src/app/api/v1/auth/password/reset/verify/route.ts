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
// alone: they are told to log out first. Set a new password then shows the
// account's email, so a link meant for someone else is noticed.
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

  // Who is signed in now, if anyone. src/proxy.ts has already refreshed the session.
  const { data: current } = await (await createStudentClient()).auth.getUser();
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
