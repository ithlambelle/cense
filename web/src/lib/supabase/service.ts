import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseConfig } from "./config";

// The service role skips row level security, so it is used only in the
// exceptions listed in api/data-contract.md ("Authorization and response
// rules"):
// - the daily cron (app/api/v1/cron/reminders): the reminder, follow-up,
//   purge and Plaid cleanup functions made for it, and a read of the
//   Analytics switch (profiles.analytics_opted_out_at, withAnalyticsOn in
//   analytics-server.ts) before sending an event; it never reads the private
//   Plaid cleanup table;
// - the signed unsubscribe link (app/api/v1/reminders/unsubscribe):
//   unsubscribe_reminders and the same Analytics switch read;
// - Delete my account (DELETE /api/v1/me): checks the cleanup trigger and
//   deletes only the signed-in student's own sign-in record;
// - the sign-in limits (lib/auth/throttle.ts): claim_auth_attempt() and
//   nothing else, before anyone is signed in;
// - the Ask Penny and confirmation email limits (lib/api/quota.ts):
//   claim_penny_ask and claim_confirmation_email, with the id of the student
//   in the verified session.
// Every other student route uses createStudentClient instead.
// "server-only" stops this file, and the key, from reaching the browser.
export function createServiceClient(serviceRoleKey: string) {
  const { url } = supabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type ServiceClient = ReturnType<typeof createServiceClient>;
