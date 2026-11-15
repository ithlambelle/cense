import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { safeReturnPath } from "@/lib/api/redirect";
import {
  encodeGoogleFlow,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_MAX_AGE,
  googleAuthorizeUrl,
  googleOAuthConfigFor,
  newGoogleFlow,
} from "@/lib/auth/google";
import { createStudentClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<Response> {
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
  const origin = request.nextUrl.origin;

  // Google returns to Cense's own address, so its account chooser names
  // Cense and not the Supabase project (src/lib/auth/google.ts). Only on an
  // address registered with Google; anywhere else keeps Supabase's flow.
  const config = googleOAuthConfigFor(origin);
  if (config) {
    const flow = newGoogleFlow(next);
    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_FLOW_COOKIE, encodeGoogleFlow(flow), {
      httpOnly: true,
      // Lax: the cookie has to come back on Google's top-level redirect.
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: GOOGLE_CALLBACK_PATH,
      maxAge: GOOGLE_FLOW_MAX_AGE,
    });
    return Response.redirect(googleAuthorizeUrl(config, flow, origin), 303);
  }

  // Not set up, or not on a registered address: Supabase's own Google flow, which returns through
  // /api/v1/auth/callback.
  const callback = new URL("/api/v1/auth/callback", origin);
  callback.searchParams.set("next", next);

  const supabase = await createStudentClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // select_account: Google asks which account every time, so a student who
    // logged out can sign in as someone else (Flow F, F8). Without it Google
    // signed them straight back into the last account.
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
  });

  if (error || !data.url) {
    return apiError(502, "google_sign_in_failed", "Google sign-in is unavailable. Please try again.");
  }

  return Response.redirect(data.url, 303);
}
