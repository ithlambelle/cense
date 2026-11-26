import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ createStudentClient: vi.fn(), signInWithOtp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createStudentClient: auth.createStudentClient }));
const throttle = vi.hoisted(() => ({
  authThrottle: vi.fn<(...args: unknown[]) => Promise<Response | null>>(async () => null),
  codeSent: vi.fn(async () => {}),
  codeCheckPassed: vi.fn(async () => {}),
  codeCheckNotMade: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/throttle", () => throttle);

import { POST } from "./route";

afterEach(() => {
  auth.createStudentClient.mockReset();
  auth.signInWithOtp.mockReset();
  throttle.authThrottle.mockClear();
  throttle.codeSent.mockClear();
  vi.unstubAllEnvs();
});

const send = (url: string) => POST(new Request(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "student@example.org" }),
}));

describe("POST /auth/email", () => {
  it("sends magic links back to the requesting deployment when no APP_BASE_URL is set (previews, local runs)", async () => {
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
      options: { emailRedirectTo: "https://cense-preview.vercel.app/api/v1/auth/callback?next=%2Fstart" },
    });
  });

  it("points any link at APP_BASE_URL, never the request's own address", async () => {
    vi.stubEnv("APP_BASE_URL", "https://censefinance.com");
    vi.stubEnv("VERCEL_ENV", "production");
    auth.createStudentClient.mockResolvedValue({ auth: { signInWithOtp: auth.signInWithOtp } });
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await send("https://attacker.example/api/v1/auth/email");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "student@example.org",
      options: { emailRedirectTo: "https://censefinance.com/api/v1/auth/callback?next=%2Fstart" },
    });
  });

  it("leaves the link to Supabase's Site URL on production without APP_BASE_URL", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VERCEL_ENV", "production");
    auth.createStudentClient.mockResolvedValue({ auth: { signInWithOtp: auth.signInWithOtp } });
    auth.signInWithOtp.mockResolvedValue({ error: null });
    expect((await send("https://attacker.example/api/v1/auth/email")).status).toBe(200);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "student@example.org", options: undefined });
    log.mockRestore();
  });

  it("counts the send against the email, and answers 429 without sending past the limit", async () => {
    auth.createStudentClient.mockResolvedValue({ auth: { signInWithOtp: auth.signInWithOtp } });
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await send("https://cense.example/api/v1/auth/email");
    expect(throttle.authThrottle).toHaveBeenCalledWith(expect.any(Request), "send", "student@example.org");

    throttle.authThrottle.mockResolvedValueOnce(Response.json({ error: { code: "rate_limited", message: "Too many tries. Try again in 9 minutes." } }, { status: 429 }));
    auth.signInWithOtp.mockClear();
    const limited = await send("https://cense.example/api/v1/auth/email");
    expect(limited.status).toBe(429);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("starts the email's code count again only once a new code is sent", async () => {
    auth.createStudentClient.mockResolvedValue({ auth: { signInWithOtp: auth.signInWithOtp } });
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await send("https://cense.example/api/v1/auth/email");
    expect(throttle.codeSent).toHaveBeenCalledWith("student@example.org", expect.any(Number));
    expect(auth.signInWithOtp.mock.invocationCallOrder[0]).toBeLessThan(throttle.codeSent.mock.invocationCallOrder[0]);

    // Supabase refused (its own wait between emails): the old code keeps its count.
    throttle.codeSent.mockClear();
    auth.signInWithOtp.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    expect((await send("https://cense.example/api/v1/auth/email")).status).toBe(502);
    throttle.authThrottle.mockResolvedValueOnce(Response.json({ error: { code: "rate_limited", message: "Too many tries." } }, { status: 429 }));
    expect((await send("https://cense.example/api/v1/auth/email")).status).toBe(429);
    expect(throttle.codeSent).not.toHaveBeenCalled();
  });
});
