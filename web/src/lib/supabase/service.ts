import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseConfig } from "./config";

// The service role skips row level security, so it is used in exactly three
// places: the daily reminder job (app/api/v1/cron/reminders) and the signed
// unsubscribe link (app/api/v1/reminders/unsubscribe), which only call the
// database functions made for them, and Delete my account (DELETE
// /api/v1/me), which only deletes the signed-in student's own sign-in record.
// Every other student route uses createStudentClient instead.
// "server-only" stops this file, and the key, from reaching the browser.
export function createServiceClient(serviceRoleKey: string) {
  const { url } = supabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type ServiceClient = ReturnType<typeof createServiceClient>;
