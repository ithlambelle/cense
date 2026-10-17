import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ createStudentClient: vi.fn(), signInWithOtp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createStudentClient: auth.createStudentClient }));

import { POST } from "./route";

afterEach(() => {
  auth.createStudentClient.mockReset();
  auth.signInWithOtp.mockReset();
});

describe("POST /auth/email", () => {
  it("sends magic links back to the requesting deployment", async () => {
    auth.createStudentClient.mockResolvedValue({ auth: { signInWithOtp: auth.signInWithOtp } });
    auth.signInWithOtp.mockResolvedValue({ error: null });

    const response = await POST(new Request("https://cense-preview.vercel.app/api/v1/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "student@example.org" }),
    }));

    expect(response.status).toBe(200);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "student@example.org",
      options: { emailRedirectTo: "https://cense-preview.vercel.app/api/v1/auth/callback" },
    });
  });
});
