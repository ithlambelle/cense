import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_OPTIONS, supabaseConfig } from "./config";

// Refreshes the student's session before the page or route runs. Supabase
// requires this step: server components cannot write cookies, so an expired
// access token must be refreshed here, where the new cookies can be set on
// both the request (for this render) and the response (for the browser).
// https://github.com/supabase/ssr/blob/main/docs/design.md ("Using the
// middleware pattern is mandatory")
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabaseConfig();

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Supabase sends no-store headers with a refreshed session, so a CDN
        // never caches one student's cookies for another.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Nothing may run between creating the client and this call, or a refresh
  // can be lost. getUser() checks the token with Supabase Auth.
  await supabase.auth.getUser();
  return response;
}
