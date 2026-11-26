import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/service";

// Created with Claude Code (2026-11-17).
//
// App-level limits on the sign-in routes (external audit of a8fe7d4). Every
// auth route calls Supabase from this server, so Supabase's own per-IP limits
// see Vercel's addresses, shared by every student. claim_auth_attempt_hashed()
// (supabase/migrations/20261117120000_auth_throttle.sql, which has the full
// table and the risk that is left) counts tries instead:
//
//   send      an email code, sign-up confirmation or reset email
//   verify    an emailed code
//   password  a password sign-in
//   link      opening a reset link
//
// The tight limits (5 emails, 10 checks per 10 minutes) are per email AND
// IP, so nobody can use up another student's tries from their own address;
// looser per-email ceilings (and 50 code checks per email a day) stop a
// guessing attack spread over many addresses.
//
// The database never sees the email or the IP (2026-11-21). This server sends
// only HMAC-SHA256 keys made with AUTH_THROTTLE_KEY, a random secret kept in
// Vercel's Sensitive settings and never in the database, to
// claim_auth_attempt_hashed() (20261121210000_keyed_auth_throttle.sql). A copy
// of the table is then useless without the secret: a plain hash of an email
// could be matched by anyone who knows the email, and an IP's by trying every
// address. Locally and in tests a fixed stand-in key is used; production
// without the real one refuses code and password checks, like a missing
// service role key.
//
// It uses the service role: the routes run before anyone is signed in, and a
// function the anon key could call would let anyone burn another student's or
// a whole campus's tries directly. It calls only that one function.
//
// When the count cannot be checked (the database call fails or takes over 3
// seconds, or production has no service role key), code and password checks
// are refused with a calm 503, so a flood cannot switch the limits off for
// guessing; emails and reset links go ahead, since Supabase still limits
// emails and a reset link cannot be guessed. Either way it is logged.
export type AuthAction = "send" | "verify" | "password" | "link";

const FAILS_CLOSED: readonly AuthAction[] = ["verify", "password"];
export const CLAIM_TIMEOUT_MS = 3_000;

// The email as counted: lowercased, trimmed, any +tag dropped from the local
// part, so a+1@x.com and a+2@x.com share a count. The database does the same.
export function throttleEmail(email: string | null): string | null {
  const value = email?.trim().toLowerCase();
  if (!value) return null;
  return value.replace(/^([^+@]*)\+[^@]*@/, "$1@");
}

// An IPv6 address's /64, written as "2001:db8:0:1::/64": one home or phone
// network usually gets a whole /64, so counting single addresses would let
// one device take a fresh address for every try. Null when it is not IPv6.
export function ipv6Prefix64(address: string): string | null {
  const value = address.split("%")[0].toLowerCase();
  if (isIP(value) !== 6) return null;
  let text = value;
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.includes("::") ? text.split("::") : [text, null];
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = tail === null ? front : [...front, ...Array<string>(8 - front.length - back.length).fill("0"), ...back];
  if (groups.length !== 8) return null;
  return `${groups.slice(0, 4).map((group) => parseInt(group, 16).toString(16)).join(":")}::/64`;
}

// The key the student's IP is counted under, or null when it cannot be
// trusted. Only on Vercel, whose edge sets x-forwarded-for and x-real-ip
// itself and overwrites whatever the client sent
// (https://vercel.com/docs/headers/request-headers). Anywhere else (local
// runs, the journey tests) a client could write any value, so the IP limits
// are skipped and the email limits apply to the email alone. IPv4-mapped
// IPv6 counts as the IPv4 address; other IPv6 by its /64.
export function clientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string | null {
  if (env.VERCEL !== "1") return null;
  for (const value of [headers.get("x-forwarded-for")?.split(",")[0], headers.get("x-real-ip")]) {
    const candidate = value?.trim();
    if (!candidate) continue;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate)?.[1];
    if (mapped && isIP(mapped) === 4) return mapped;
    if (isIP(candidate) === 4) return candidate;
    const prefix = ipv6Prefix64(candidate);
    if (prefix) return prefix;
  }
  return null;
}

// Locally, in the journey tests and on previews without the real key. It is
// in the repository, so it protects nothing: production never uses it.
const STAND_IN_KEY = "cense-local-auth-throttle-key-not-secret";
const MIN_KEY_LENGTH = 32;

// The key for one limit: HMAC-SHA256 of a label and the value, in lowercase
// hex. The label keeps an email, an email with an IP and an IP from ever
// sharing a key.
export function throttleKey(secret: string, label: "email_ip" | "email" | "ip", value: string): string {
  return createHmac("sha256", secret).update(`${label}\n${value}`).digest("hex");
}

// The three keys a claim needs. The email + IP key uses an empty IP when the
// IP is unknown, so those limits then apply to the email alone, as before.
export function throttleKeys(secret: string, email: string | null, ip: string | null) {
  return {
    p_email_ip_hash: email ? throttleKey(secret, "email_ip", `${email}|${ip ?? ""}`) : null,
    p_email_hash: email ? throttleKey(secret, "email", email) : null,
    p_ip_hash: ip ? throttleKey(secret, "ip", ip) : null,
  };
}

let warnedNotConfigured = false;
let warnedNoKey = false;

function waitMessage(seconds: number): string {
  if (seconds > 90 * 60) {
    const hours = Math.ceil(seconds / 3600);
    return `Too many tries. Try again in ${hours} hours.`;
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many tries. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

// The answer when the count could not be checked: refused for code and
// password checks, let through otherwise.
function unchecked(action: AuthAction): Response | null {
  if (!FAILS_CLOSED.includes(action)) return null;
  const response = apiError(503, "sign_in_busy", "Sign-in is busy right now. Try again in a minute.");
  response.headers.set("Retry-After", "60");
  return response;
}

// Null when the try may go ahead. Otherwise the answer to send back, in the
// API's error shape: 429 rate_limited past a limit, or 503 sign_in_busy when
// a code or password check could not be counted. `email` is the one the
// request names, or null when it names none.
export async function authThrottle(
  request: Request,
  action: AuthAction,
  email: string | null,
  env: Record<string, string | undefined> = process.env,
): Promise<Response | null> {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    // A local run or preview without the key is normal: no limits there.
    // Production without it is not: checks are refused.
    if (env.VERCEL_ENV && !warnedNotConfigured) {
      warnedNotConfigured = true;
      console.error(JSON.stringify({ event: "auth_throttle_not_configured", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }));
    }
    return env.VERCEL_ENV === "production" ? unchecked(action) : null;
  }

  const secret = env.AUTH_THROTTLE_KEY?.trim();
  const keyed = secret && secret.length >= MIN_KEY_LENGTH ? secret : null;
  if (!keyed && env.VERCEL_ENV && !warnedNoKey) {
    warnedNoKey = true;
    // Set but too short reads differently from not set, so a mistyped key is
    // found quickly.
    console.error(JSON.stringify(secret ? { event: "auth_throttle_not_configured", invalid: ["AUTH_THROTTLE_KEY"], reason: "too_short" } : { event: "auth_throttle_not_configured", missing: ["AUTH_THROTTLE_KEY"] }));
  }
  if (!keyed && env.VERCEL_ENV === "production") return unchecked(action);

  let wait: unknown;
  try {
    const { data, error } = await createServiceClient(serviceRoleKey)
      .rpc("claim_auth_attempt_hashed", {
        p_action: action,
        ...throttleKeys(keyed ?? STAND_IN_KEY, throttleEmail(email), clientIp(request.headers, env)),
      })
      .abortSignal(AbortSignal.timeout(CLAIM_TIMEOUT_MS));
    if (error) {
      // The code only: never the email or the IP.
      console.error(JSON.stringify({ event: "database_error", operation: "auth_throttle", action, code: error.code }));
      return unchecked(action);
    }
    wait = data;
  } catch {
    console.error(JSON.stringify({ event: "database_error", operation: "auth_throttle", action, code: "fetch_failed" }));
    return unchecked(action);
  }

  if (typeof wait !== "number" || !Number.isFinite(wait) || wait <= 0) return null;
  const seconds = Math.min(86_400, Math.ceil(wait));
  const response = apiError(429, "rate_limited", waitMessage(seconds));
  response.headers.set("Retry-After", String(seconds));
  return response;
}
