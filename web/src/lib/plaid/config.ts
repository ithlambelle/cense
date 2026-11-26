import "server-only";

import { parseTokenKey, type TokenKey } from "./token-box";

// Plaid settings, read from the server's environment (names in
// web/.env.example). PLAID_ENV picks one of two worlds, and anything else
// turns the feature off, so a typo can never reach a real bank:
// - "sandbox": Plaid's test banks, open to every student (Plaid memo,
//   2026-10-21).
// - "production": real banks, for a hand-picked pilot only. Who may link and
//   how many real Items the app may make live in the database, set by hand
//   (supabase/migrations/20261125120000_plaid_pilot.sql, lib/plaid/pilot.ts),
//   and start at nobody and none.
export type PlaidEnvironment = "sandbox" | "production";

export type PlaidConfig = {
  clientId: string;
  secret: string;
  baseUrl: string;
  tokenKey: TokenKey;
  environment: PlaidEnvironment;
};

const PLAID_URLS: Record<PlaidEnvironment, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function environment(value: string | undefined): PlaidEnvironment | null {
  return value === "sandbox" || value === "production" ? value : null;
}

// PLAID_BASE_URL points the app at the journey tests' stand-in Plaid
// (web/e2e/support/fake-plaid.ts). Only a loopback address is accepted: the
// client id and secret are sent to it. Never in production: real keys only
// ever go to Plaid, so an override there turns the feature off instead of
// being ignored (it means the settings are mixed up).
function baseUrl(env: PlaidEnvironment, override: string | undefined): string | null {
  if (!override) return PLAID_URLS[env];
  if (env === "production") return null;
  try {
    const url = new URL(override);
    if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return url.origin;
  } catch {
    // Not a URL.
  }
  return null;
}

// The settings, or null when safe to spend is off: a value is missing, the
// environment is neither sandbox nor production, the token key is not 32
// bytes, or the base URL override is not local (or is set at all in
// production). Never logs a value.
export function plaidConfig(env: Record<string, string | undefined> = process.env): PlaidConfig | null {
  const environmentName = environment(env.PLAID_ENV?.trim());
  if (!environmentName) return null;
  const clientId = env.PLAID_CLIENT_ID?.trim();
  const secret = env.PLAID_SECRET?.trim();
  const tokenKey = parseTokenKey(env.PLAID_TOKEN_KEY);
  const url = baseUrl(environmentName, env.PLAID_BASE_URL?.trim());
  if (!clientId || !secret || !tokenKey || !url) return null;
  return { clientId, secret, baseUrl: url, tokenKey, environment: environmentName };
}

export function safeToSpendEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return plaidConfig(env) !== null;
}
