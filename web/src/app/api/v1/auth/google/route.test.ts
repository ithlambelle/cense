import { afterEach, describe, expect, it, vi } from "vitest";

const signInWithOAuth = vi.hoisted(() => vi.fn());
const cookieSet = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createStudentClient: async () => ({ auth: { signInWithOAuth } }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet }) }));

import { NextRequest } from "next/server";

import { decodeGoogleFlow } from "@/lib/auth/google";

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /auth/google", () => {
  it("without Cense's own Google client, uses Supabase's flow and asks Google to show its account chooser every time (F8)", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.example.test/o/oauth2" }, error: null });
    const response = await GET(new NextRequest("http://localhost:3300/api/v1/auth/google?next=%2Fhome"));
    expect(response.status).toBe(303);
    const options = signInWithOAuth.mock.calls[0][0].options;
    expect(options.queryParams).toEqual({ prompt: "select_account" });
    expect(options.redirectTo).toBe("http://localhost:3300/api/v1/auth/callback?next=%2Fhome");
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("with Cense's own Google client, sends Google back to Cense's address so the chooser never names supabase.co", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret-xyz");
    const response = await GET(new NextRequest("https://www.censefinance.com/api/v1/auth/google?next=%2Fhome"));
    expect(response.status).toBe(303);
    expect(signInWithOAuth).not.toHaveBeenCalled();

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.host).toBe("accounts.google.com");
    expect(location.searchParams.get("redirect_uri")).toBe("https://www.censefinance.com/api/v1/auth/google/callback");
    expect(location.searchParams.get("prompt")).toBe("select_account");
    expect(location.toString()).not.toContain("supabase");

    const [name, value, options] = cookieSet.mock.calls[0];
    expect(name).toBe("cense_google_flow");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/api/v1/auth/google/callback", maxAge: 600 });
    const flow = decodeGoogleFlow(value);
    expect(flow?.next).toBe("/home");
    expect(location.searchParams.get("state")).toBe(flow?.state);
  });

  it("keeps Supabase's flow on an address Google does not know, such as the vercel.app alias", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.example.test/o/oauth2" }, error: null });
    await GET(new NextRequest("https://cense-eta.vercel.app/api/v1/auth/google?next=%2Fhome"));
    expect(signInWithOAuth).toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("keeps an unsafe next out of the flow", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    await GET(new NextRequest("https://www.censefinance.com/api/v1/auth/google?next=https%3A%2F%2Fevil.example"));
    expect(decodeGoogleFlow(cookieSet.mock.calls[0][1])?.next).toBe("/start");
  });

  it("does not mark the cookie Secure on plain-http localhost", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("GOOGLE_OAUTH_ORIGINS", "http://localhost:3300");
    await GET(new NextRequest("http://localhost:3300/api/v1/auth/google"));
    expect(cookieSet.mock.calls[0][2].secure).toBe(false);
  });
});
