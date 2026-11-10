import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithIdToken = vi.hoisted(() => vi.fn());
const exchangeGoogleCode = vi.hoisted(() => vi.fn());
const jar = vi.hoisted(() => ({ value: undefined as string | undefined, deleted: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createStudentClient: async () => ({ auth: { signInWithIdToken } }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "cense_google_flow" && jar.value ? { name, value: jar.value } : undefined),
    delete: (options: unknown) => jar.deleted.push(options),
  }),
}));
vi.mock("@/lib/auth/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/google")>()),
  exchangeGoogleCode,
}));

import { NextRequest } from "next/server";

import { encodeGoogleFlow, type GoogleFlow } from "@/lib/auth/google";

import { GET } from "./route";

const flow: GoogleFlow = { state: "state-abc", nonce: "nonce-raw", verifier: "verifier-1", next: "/home" };
const ORIGIN = "https://www.censefinance.com";
const callback = (query: string) => GET(new NextRequest(`${ORIGIN}/api/v1/auth/google/callback?${query}`));
const location = (response: Response) => response.headers.get("location");

beforeEach(() => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret-xyz");
  jar.value = encodeGoogleFlow(flow);
  jar.deleted = [];
  exchangeGoogleCode.mockResolvedValue("id.token.value");
  signInWithIdToken.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /auth/google/callback", () => {
  it("signs the student in with Google's ID token and the raw nonce, then lands on next", async () => {
    const response = await callback("code=c1&state=state-abc");
    expect(response.status).toBe(303);
    expect(location(response)).toBe(`${ORIGIN}/home`);
    expect(exchangeGoogleCode).toHaveBeenCalledWith({ clientId: "client-123", clientSecret: "secret-xyz" }, "c1", flow, ORIGIN);
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: "google", token: "id.token.value", nonce: "nonce-raw" });
    expect(jar.deleted).toEqual([{ name: "cense_google_flow", path: "/api/v1/auth/google/callback" }]);
  });

  it("refuses a state that is not this browser's (a forged sign-in link)", async () => {
    const response = await callback("code=c1&state=someone-elses");
    expect(location(response)).toBe(`${ORIGIN}/sign-in?error=callback`);
    expect(exchangeGoogleCode).not.toHaveBeenCalled();
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("refuses when the browser has no flow cookie (expired or never started here)", async () => {
    jar.value = undefined;
    const response = await callback("code=c1&state=state-abc");
    expect(location(response)).toBe(`${ORIGIN}/sign-in?error=callback`);
    expect(exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it("says canceled when the student backs out at Google", async () => {
    const response = await callback("error=access_denied&state=state-abc");
    expect(location(response)).toBe(`${ORIGIN}/sign-in?error=cancelled`);
    expect(jar.deleted).toHaveLength(1);
  });

  it("says it did not finish for a missing code, a refused code, or a token Supabase rejects", async () => {
    expect(location(await callback("state=state-abc"))).toBe(`${ORIGIN}/sign-in?error=callback`);

    exchangeGoogleCode.mockResolvedValueOnce(null);
    expect(location(await callback("code=c1&state=state-abc"))).toBe(`${ORIGIN}/sign-in?error=callback`);

    signInWithIdToken.mockResolvedValueOnce({ data: {}, error: new Error("Bad ID token") });
    expect(location(await callback("code=c1&state=state-abc"))).toBe(`${ORIGIN}/sign-in?error=callback`);
  });

  it("says it did not finish when the feature is off", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    expect(location(await callback("code=c1&state=state-abc"))).toBe(`${ORIGIN}/sign-in?error=callback`);
    expect(exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it("never sends the student off-site, even if the cookie's next was tampered with", async () => {
    jar.value = encodeGoogleFlow({ ...flow, next: "//evil.example" });
    expect(location(await callback("code=c1&state=state-abc"))).toBe(`${ORIGIN}/start`);
  });
});
