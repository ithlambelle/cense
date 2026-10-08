import { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { safeReturnPath } from "@/lib/api/redirect";
import { createStudentClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<Response> {
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
  const callback = new URL("/api/v1/auth/callback", request.nextUrl.origin);
  callback.searchParams.set("next", next);

  const supabase = await createStudentClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    return apiError(502, "google_sign_in_failed", "Google sign-in is unavailable. Please try again.");
  }

  return Response.redirect(data.url, 303);
}
