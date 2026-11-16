import "server-only";

import { isIP } from "node:net";

import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/service";

// Created with Claude Code (2026-11-17).
//
// App-level limits on the sign-in routes (external audit of a8fe7d4). Every
// auth route calls Supabase from this server, so Supabase's own per-IP limits
// see Vercel's addresses, shared by every student. claim_auth_attempt()
// (supabase/migrations/20261117120000_auth_throttle.sql) counts tries per
// email and per student IP over 10 minutes instead:
//
//   send      an email code, sign-up confirmation or reset email: 5 per email, 300 per IP
//   verify    an emailed code: 10 per email, 600 per IP (with the two below)
//   password  a password sign-in: 10 per email
//   link      opening a reset link: per IP only
//
// It uses the service role: the routes run before anyone is signed in, and a
// function the anon key could call would let anyone burn another student's or
// a whole campus's tries directly. It calls only that one function.
//
// It fails open: with no service role key, or when the database call fails,
// the try goes ahead and the problem is logged. Supabase's own limits still
// apply then, and a database hiccup never locks every student out.
export type AuthAction = "send" | "verify" | "password" | "link";

// The student's IP, or null when it cannot be trusted. Only on Vercel, whose
// edge sets x-forwarded-for and x-real-ip itself and overwrites whatever the
// client sent (https://vercel.com/docs/headers/request-headers). Anywhere
// else (local runs, the journey tests) a client could write any value, so
// the per-IP limit is skipped and the per-email one still applies.
export function clientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string | null {
  if (env.VERCEL !== "1") return null;
  for (const value of [headers.get("x-forwarded-for")?.split(",")[0], headers.get("x-real-ip")]) {
    const candidate = value?.trim();
    if (candidate && isIP(candidate)) return candidate;
  }
  return null;
}

let warnedNotConfigured = false;

function waitMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many tries. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

// Null when the try may go ahead. Otherwise the 429 to send back, in the
// API's error shape, with Retry-After. `email` is the one the request names,
// or null when it names none.
export async function authThrottle(
  request: Request,
  action: AuthAction,
  email: string | null,
  env: Record<string, string | undefined> = process.env,
): Promise<Response | null> {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    // Logged once, and only on Vercel: a local run without the key is normal.
    if (env.VERCEL_ENV && !warnedNotConfigured) {
      warnedNotConfigured = true;
      console.error(JSON.stringify({ event: "auth_throttle_not_configured", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }));
    }
    return null;
  }

  let wait: unknown;
  try {
    const { data, error } = await createServiceClient(serviceRoleKey).rpc("claim_auth_attempt", {
      p_action: action,
      p_email: email,
      p_ip: clientIp(request.headers, env),
    });
    if (error) {
      // The code only: never the email or the IP.
      console.error(JSON.stringify({ event: "database_error", operation: "auth_throttle", code: error.code }));
      return null;
    }
    wait = data;
  } catch {
    console.error(JSON.stringify({ event: "database_error", operation: "auth_throttle", code: "fetch_failed" }));
    return null;
  }

  if (typeof wait !== "number" || !Number.isFinite(wait) || wait <= 0) return null;
  const seconds = Math.min(600, Math.ceil(wait));
  const response = apiError(429, "rate_limited", waitMessage(seconds));
  response.headers.set("Retry-After", String(seconds));
  return response;
}
