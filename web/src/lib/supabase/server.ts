import { createServerClient } from "@supabase/ssr";
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
