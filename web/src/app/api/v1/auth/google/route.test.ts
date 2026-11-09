import { describe, expect, it, vi } from "vitest";

const signInWithOAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createStudentClient: async () => ({ auth: { signInWithOAuth } }) }));

import { NextRequest } from "next/server";

import { GET } from "./route";

describe("GET /auth/google", () => {
  it("asks Google to show its account chooser every time (F8)", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.example.test/o/oauth2" }, error: null });
    const response = await GET(new NextRequest("http://localhost:3300/api/v1/auth/google?next=%2Fhome"));
    expect(response.status).toBe(303);
    const options = signInWithOAuth.mock.calls[0][0].options;
    expect(options.queryParams).toEqual({ prompt: "select_account" });
    expect(options.redirectTo).toBe("http://localhost:3300/api/v1/auth/callback?next=%2Fhome");
  });
});
