import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { SESSION_COOKIE_OPTIONS, supabaseConfig } from "./config";

export async function createStudentClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseConfig();

  return createServerClient(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot write cookies. src/proxy.ts refreshes the
          // session before every page renders, so nothing is lost here.
        }
      },
    },
  });
}

// Keeps nothing: no session and no cookies. For a call that must leave no trace
// in the response, such as the sign-in code sign-up sends an email that already
// has an account (the student client would add a cookie only that answer has).
export function createCookielessClient() {
  const { url, publishableKey } = supabaseConfig();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
