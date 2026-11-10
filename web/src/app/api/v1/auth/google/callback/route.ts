import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { safeReturnPath } from "@/lib/api/redirect";
import {
  decodeGoogleFlow,
  exchangeGoogleCode,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_FLOW_COOKIE,
  googleOAuthConfig,
} from "@/lib/auth/google";
import { ROUTES } from "@/lib/routes";
import { createStudentClient } from "@/lib/supabase/server";

// Google returns here when GOOGLE_OAUTH_CLIENT_ID and _SECRET are set
// (src/lib/auth/google.ts). Same outcomes as /api/v1/auth/callback: the
// student lands on `next` signed in, or on /sign-in with ?error=cancelled
// (they backed out at Google) or ?error=callback (anything else failed).
export async function GET(request: NextRequest): Promise<Response> {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const signInWith = (error: "cancelled" | "callback") =>
    Response.redirect(new URL(`${ROUTES.signIn}?error=${error}`, origin), 303);

  const cookieStore = await cookies();
  const flow = decodeGoogleFlow(cookieStore.get(GOOGLE_FLOW_COOKIE)?.value);
  // One use only, whatever happens next.
  cookieStore.delete({ name: GOOGLE_FLOW_COOKIE, path: GOOGLE_CALLBACK_PATH });

  if (params.get("error") === "access_denied") return signInWith("cancelled");

  const config = googleOAuthConfig();
  const code = params.get("code");
  // The state has to match the one this browser was sent off with, or the
  // code may be someone else's (a forged sign-in link).
  if (!config || !flow || !code || params.get("state") !== flow.state) return signInWith("callback");

  const idToken = await exchangeGoogleCode(config, code, flow, origin);
  if (!idToken) return signInWith("callback");

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: flow.nonce });
  if (error) return signInWith("callback");

  return Response.redirect(new URL(safeReturnPath(flow.next), origin), 303);
}
