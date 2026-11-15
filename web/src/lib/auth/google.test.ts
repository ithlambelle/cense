import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decodeGoogleFlow,
  encodeGoogleFlow,
  exchangeGoogleCode,
  googleAuthorizeUrl,
  googleOAuthConfig,
  googleOAuthConfigFor,
  hashedNonce,
  newGoogleFlow,
} from "./google";

const config = { clientId: "client-123.apps.googleusercontent.com", clientSecret: "secret-xyz", origins: ["https://www.censefinance.com"] };

describe("googleOAuthConfig", () => {
  it("is off unless both the client id and secret are set", () => {
    expect(googleOAuthConfig({})).toBeNull();
    expect(googleOAuthConfig({ GOOGLE_OAUTH_CLIENT_ID: "id" })).toBeNull();
    expect(googleOAuthConfig({ GOOGLE_OAUTH_CLIENT_SECRET: "secret" })).toBeNull();
    expect(googleOAuthConfig({ GOOGLE_OAUTH_CLIENT_ID: " ", GOOGLE_OAUTH_CLIENT_SECRET: "secret" })).toBeNull();
    expect(googleOAuthConfig({ GOOGLE_OAUTH_CLIENT_ID: " id ", GOOGLE_OAUTH_CLIENT_SECRET: "secret" })).toMatchObject({ clientId: "id", clientSecret: "secret" });
  });

  it("only runs on an address registered with Google: censefinance.com by default, or the list given", () => {
    const env = { GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "secret" };
    expect(googleOAuthConfigFor("https://www.censefinance.com", env)).not.toBeNull();
    expect(googleOAuthConfigFor("https://censefinance.com", env)).not.toBeNull();
    // The production vercel.app alias and previews keep Supabase's flow.
    expect(googleOAuthConfigFor("https://cense-eta.vercel.app", env)).toBeNull();
    expect(googleOAuthConfigFor("http://www.censefinance.com", env)).toBeNull();

    const local = { ...env, GOOGLE_OAUTH_ORIGINS: "http://localhost:3300, not a url" };
    expect(googleOAuthConfigFor("http://localhost:3300", local)).not.toBeNull();
    expect(googleOAuthConfigFor("https://www.censefinance.com", local)).toBeNull();
    expect(googleOAuthConfigFor("http://localhost:3300", {})).toBeNull();
  });
});

describe("googleAuthorizeUrl", () => {
  it("sends Google back to Cense's own address, never the Supabase project", () => {
    const flow = newGoogleFlow("/home");
    const url = new URL(googleAuthorizeUrl(config, flow, "https://www.censefinance.com"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const params = url.searchParams;
    expect(params.get("redirect_uri")).toBe("https://www.censefinance.com/api/v1/auth/google/callback");
    expect(params.get("client_id")).toBe(config.clientId);
    expect(params.get("response_type")).toBe("code");
    expect(params.get("scope")).toBe("openid email profile");
    expect(params.get("prompt")).toBe("select_account");
    expect(params.get("state")).toBe(flow.state);
    // Google gets the hashed nonce; Supabase gets the raw one and hashes it.
    expect(params.get("nonce")).toBe(createHash("sha256").update(flow.nonce).digest("hex"));
    expect(params.get("code_challenge")).toBe(createHash("sha256").update(flow.verifier).digest("base64url"));
    expect(params.get("code_challenge_method")).toBe("S256");
    // The secret never leaves the server.
    expect(url.toString()).not.toContain(config.clientSecret);
    expect(url.toString()).not.toContain(flow.verifier);
  });

  it("lands on /start instead of keeping a return path long enough to break the cookie", () => {
    expect(newGoogleFlow(`/cards?q=${"a".repeat(600)}`).next).toBe("/start");
    expect(newGoogleFlow("/home").next).toBe("/home");
  });

  it("makes a fresh state, nonce and verifier each time", () => {
    const a = newGoogleFlow("/home");
    const b = newGoogleFlow("/home");
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state.length).toBeGreaterThanOrEqual(43);
  });
});

describe("the flow cookie", () => {
  it("round-trips", () => {
    const flow = newGoogleFlow("/quiz?step=2");
    expect(decodeGoogleFlow(encodeGoogleFlow(flow))).toEqual(flow);
  });

  it("refuses anything that is not a whole flow", () => {
    expect(decodeGoogleFlow(undefined)).toBeNull();
    expect(decodeGoogleFlow("")).toBeNull();
    expect(decodeGoogleFlow("not base64 json")).toBeNull();
    expect(decodeGoogleFlow(Buffer.from("[]").toString("base64url"))).toBeNull();
    expect(decodeGoogleFlow(Buffer.from(JSON.stringify({ state: "s", nonce: "n", verifier: "v" })).toString("base64url"))).toBeNull();
    expect(decodeGoogleFlow(Buffer.from(JSON.stringify({ state: "s", nonce: 1, verifier: "v", next: "/" })).toString("base64url"))).toBeNull();
  });
});

describe("hashedNonce", () => {
  it("is SHA-256 in hex, as Supabase checks it", () => {
    expect(hashedNonce("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("exchangeGoogleCode", () => {
  const flow = newGoogleFlow("/home");

  it("posts the code with the same redirect address and the PKCE verifier, and returns the ID token", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id_token: "header.payload.sig", access_token: "a" }));
    const tokens = await exchangeGoogleCode(config, "code-1", flow, "https://www.censefinance.com", fetchImpl as unknown as typeof fetch);
    expect(tokens).toEqual({ idToken: "header.payload.sig", accessToken: "a" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("code")).toBe("code-1");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe(config.clientId);
    expect(body.get("client_secret")).toBe(config.clientSecret);
    expect(body.get("redirect_uri")).toBe("https://www.censefinance.com/api/v1/auth/google/callback");
    expect(body.get("code_verifier")).toBe(flow.verifier);
  });

  it("returns null when Google refuses, answers without a token, or cannot be reached", async () => {
    const refused = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    const noToken = vi.fn(async () => Response.json({ access_token: "a" }));
    const notJson = vi.fn(async () => new Response("<html>", { status: 200 }));
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    for (const fetchImpl of [refused, noToken, notJson, offline]) {
      expect(await exchangeGoogleCode(config, "c", flow, "https://x.test", fetchImpl as unknown as typeof fetch)).toBeNull();
    }
  });
});
