import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { ROUTES } from "@/lib/routes";

// Google sign-in that runs on Cense's own address. With Supabase's own Google
// flow, Google's account chooser says "to continue to <project>.supabase.co"
// because Google returns the student to Supabase. Here Google returns them to
// /api/v1/auth/google/callback on our own domain, so the chooser names Cense's
// domain (or "Cense", once the Google Cloud brand is verified). The callback
// trades Google's code for an ID token and hands that to Supabase
// (signInWithIdToken), which checks it and starts the same session as before.
//
// Off unless both values are set (web/.env.example). When off, the old
// Supabase flow runs, so this can ship before the Google Cloud settings are
// done, and preview deployments, whose addresses Google does not know, keep
// working.
export type GoogleOAuthConfig = { clientId: string; clientSecret: string; origins: string[] };

// The addresses registered on the Google client as return addresses. Google
// refuses any other with an error page the student cannot leave, so a visit
// from anywhere else (a vercel.app alias, a preview) keeps Supabase's flow.
// GOOGLE_OAUTH_ORIGINS replaces the list (the journey tests use localhost).
const PRODUCTION_ORIGINS = ["https://www.censefinance.com", "https://censefinance.com"];

function parseOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return PRODUCTION_ORIGINS;
  const origins: string[] = [];
  for (const part of value.split(",")) {
    try {
      const url = new URL(part.trim());
      if (url.protocol === "https:" || url.protocol === "http:") origins.push(url.origin);
    } catch {
      // Not an address: left out.
    }
  }
  return origins;
}

export function googleOAuthConfig(env: Record<string, string | undefined> = process.env): GoogleOAuthConfig | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, origins: parseOrigins(env.GOOGLE_OAUTH_ORIGINS) };
}

// The settings, only when this request's address is one Google will return to.
export function googleOAuthConfigFor(origin: string, env: Record<string, string | undefined> = process.env): GoogleOAuthConfig | null {
  const config = googleOAuthConfig(env);
  return config && config.origins.includes(origin) ? config : null;
}

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALLBACK_PATH = "/api/v1/auth/google/callback";

// What the start route keeps for the callback: the state Google must send
// back, the nonce Supabase checks inside the ID token, the PKCE verifier, and
// where to land. httpOnly, scoped to the callback, gone after 10 minutes.
export const GOOGLE_FLOW_COOKIE = "cense_google_flow";
export const GOOGLE_FLOW_MAX_AGE = 600;

export type GoogleFlow = { state: string; nonce: string; verifier: string; next: string };

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

// A longer return path could push the cookie past the browser's 4 KB limit,
// and a dropped cookie fails the sign-in; no screen of ours needs one.
const MAX_NEXT_LENGTH = 512;

export function newGoogleFlow(next: string): GoogleFlow {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken(), next: next.length > MAX_NEXT_LENGTH ? ROUTES.start : next };
}

// Supabase hashes the nonce it is given with SHA-256 (hex) and compares it to
// the token's nonce claim, so Google gets the hash and Supabase the raw value.
export function hashedNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function encodeGoogleFlow(flow: GoogleFlow): string {
  return Buffer.from(JSON.stringify(flow)).toString("base64url");
}

export function decodeGoogleFlow(value: string | undefined): GoogleFlow | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const { state, nonce, verifier, next } = parsed as Record<string, unknown>;
    if ([state, nonce, verifier, next].every((part) => typeof part === "string" && part.length > 0)) {
      return { state, nonce, verifier, next } as GoogleFlow;
    }
  } catch {
    // Not ours.
  }
  return null;
}

export function googleRedirectUri(origin: string): string {
  return new URL(GOOGLE_CALLBACK_PATH, origin).toString();
}

export function googleAuthorizeUrl(config: GoogleOAuthConfig, flow: GoogleFlow, origin: string): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: hashedNonce(flow.nonce),
    code_challenge: pkceChallenge(flow.verifier),
    code_challenge_method: "S256",
    // select_account: Google asks which account every time, so a student who
    // logged out can sign in as someone else (Flow F, F8).
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export type GoogleTokens = { idToken: string; accessToken?: string };

// Trades Google's one-time code for the ID token, and the access token that
// Supabase checks against the ID token's at_hash. Null on any failure; never
// logs the code, the secret or a token.
export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
  flow: GoogleFlow,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleTokens | null> {
  try {
    const response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: googleRedirectUri(origin),
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return null;
    const { id_token: idToken, access_token: accessToken } = body as { id_token?: unknown; access_token?: unknown };
    if (typeof idToken !== "string" || idToken.length === 0) return null;
    return typeof accessToken === "string" && accessToken.length > 0 ? { idToken, accessToken } : { idToken };
  } catch {
    return null;
  }
}
