import "server-only";

import { parseTokenKey, type TokenKey } from "./token-box";

// Plaid settings, read from the server's environment (names in
// web/.env.example). Sandbox only this semester (Plaid memo, 2026-10-21):
// any PLAID_ENV other than "sandbox" turns the feature off, so a production
// key can never be used by mistake.
export type PlaidConfig = {
  clientId: string;
  secret: string;
  baseUrl: string;
  tokenKey: TokenKey;
};

const SANDBOX_URL = "https://sandbox.plaid.com";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// PLAID_BASE_URL points the app at the journey tests' stand-in Plaid
// (web/e2e/support/fake-plaid.ts). Only a loopback address is accepted: the
// client id and secret are sent to it.
function baseUrl(override: string | undefined): string | null {
  if (!override) return SANDBOX_URL;
  try {
    const url = new URL(override);
    if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return url.origin;
  } catch {
    // Not a URL.
  }
  return null;
}

// The settings, or null when safe to spend is off: a value is missing, the
// environment is not sandbox, the token key is not 32 bytes, or the base URL
// override is not local. Never logs a value.
export function plaidConfig(env: Record<string, string | undefined> = process.env): PlaidConfig | null {
  const clientId = env.PLAID_CLIENT_ID?.trim();
  const secret = env.PLAID_SECRET?.trim();
  const tokenKey = parseTokenKey(env.PLAID_TOKEN_KEY);
  const url = baseUrl(env.PLAID_BASE_URL?.trim());
  if (!clientId || !secret || !tokenKey || !url || env.PLAID_ENV?.trim() !== "sandbox") return null;
  return { clientId, secret, baseUrl: url, tokenKey };
}

export function safeToSpendEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return plaidConfig(env) !== null;
}
