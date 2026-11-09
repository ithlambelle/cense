import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

// Server-only settings for the reminder job and the unsubscribe link, read
// from Vercel's environment variables (names in web/.env.example).

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". Compared in
// constant time (as hashes, so the lengths always match). With no secret
// set, nothing is authorized.
export function cronAuthorized(header: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !header) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

type Settings = {
  serviceRoleKey: string;
  resendApiKey: string;
  fromEmail: string;
  appUrl: string;
  unsubscribeSecret: string;
};

const NAMES: Record<keyof Settings, string> = {
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  resendApiKey: "RESEND_API_KEY",
  fromEmail: "REMINDER_FROM_EMAIL",
  appUrl: "APP_BASE_URL",
  unsubscribeSecret: "REMINDER_UNSUBSCRIBE_SECRET",
};

// The settings asked for, or the names of the ones that are missing (names
// only, safe to log).
export function reminderSettings<K extends keyof Settings>(
  keys: K[],
  env: Record<string, string | undefined> = process.env,
): { ok: true; settings: Pick<Settings, K> } | { ok: false; missing: string[] } {
  const settings = {} as Pick<Settings, K>;
  const missing: string[] = [];
  for (const key of keys) {
    const value = env[NAMES[key]]?.trim();
    if (value) settings[key] = (key === "appUrl" ? value.replace(/\/+$/, "") : value) as Pick<Settings, K>[K];
    else missing.push(NAMES[key]);
  }
  return missing.length ? { ok: false, missing } : { ok: true, settings };
}

// Resend's send endpoint. RESEND_BASE_URL (the name Resend's own SDK reads)
// points it at a stand-in on this machine for the journey tests
// (web/e2e/support/fake-email-server.ts), so they never call the real API. An
// address that is not on this machine is ignored: a stray value on Vercel can
// never send the key or a student's email anywhere but Resend.
export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resendEmailsUrl(base = process.env.RESEND_BASE_URL): string {
  if (!base) return RESEND_EMAILS_URL;
  try {
    const url = new URL(base);
    if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return `${url.origin}/emails`;
  } catch {
    // not an address: ignored
  }
  return RESEND_EMAILS_URL;
}
