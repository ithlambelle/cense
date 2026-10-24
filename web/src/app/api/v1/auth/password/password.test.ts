import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

// The sign-in code for an existing account goes through the cookieless client.
const otpAuth = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createStudentClient: async () => ({ auth }),
  createCookielessClient: () => ({ auth: otpAuth }),
}));

import { POST as signUp } from "./signup/route";
import { POST as signIn } from "./signin/route";
import { POST as reset } from "./reset/route";
import { POST as confirm } from "./reset/confirm/route";
import { GET as verify } from "./reset/verify/route";

function request(path: string, payload: unknown): Request {
  return new Request(`https://cense.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("optional password auth", () => {
  it("creates an account using the allowlisted callback and reports email confirmation", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const response = await signUp(request("/api/v1/auth/password/signup", {
      email: "student@example.com", password: "long-enough-password",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "check_email" });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "long-enough-password",
      options: { emailRedirectTo: "https://cense.example/api/v1/auth/callback?next=%2Fsign-in%3Fconfirmed%3D1" },
    });
  });

  it("does not call the provider for an invalid password", async () => {
    const response = await signUp(request("/api/v1/auth/password/signup", {
      email: "student@example.com", password: "short",
    }));
    expect(response.status).toBe(400);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("rejects a password longer than 72 UTF-8 bytes", async () => {
    const response = await signUp(request("/api/v1/auth/password/signup", {
      email: "student@example.com", password: "é".repeat(37),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("72 bytes");
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  const SIGN_UP_BODY = { email: "student@example.com", password: "long-enough-password" };
  const NEW_STUDENT = { data: { user: { id: "new", identities: [{ provider: "email" }] }, session: null }, error: null };
  // Supabase's two signals for an email that already has a confirmed account.
  const EXISTING = {
    "the error user_already_exists (confirmation off)": { data: { user: null, session: null }, error: new AuthApiError("User already registered", 422, "user_already_exists") },
    "a placeholder user with no identities (confirmation on)": { data: { user: { id: "placeholder", identities: [] }, session: null }, error: null },
  };

  async function answer(response: Response) {
    return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
  }

  for (const [signal, result] of Object.entries(EXISTING)) {
    it(`answers an existing account exactly like a new one, and emails it a sign-in code, for ${signal}`, async () => {
      auth.signUp.mockResolvedValue(NEW_STUDENT);
      const forNew = await answer(await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY)));
      expect(otpAuth.signInWithOtp).not.toHaveBeenCalled();

      auth.signUp.mockResolvedValue(result);
      otpAuth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
      const forExisting = await answer(await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY)));

      expect(forExisting).toEqual(forNew);
      expect(forExisting.body).toEqual({ status: "check_email" });
      expect(otpAuth.signInWithOtp).toHaveBeenCalledWith({ email: "student@example.com", options: { shouldCreateUser: false } });
    });
  }

  it("keeps the same answer when the sign-in code fails to send, and logs no email", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.signUp.mockResolvedValue(EXISTING["a placeholder user with no identities (confirmation on)"]);
    otpAuth.signInWithOtp.mockResolvedValue({ data: {}, error: new AuthApiError("Too many requests", 429, "over_email_send_rate_limit") });
    const response = await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "check_email" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("student@example.com");
    log.mockRestore();
  });

  it("signs the student in when Supabase returns a session", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "new", identities: [{ provider: "email" }] }, session: {} }, error: null });
    const response = await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
    expect(await response.json()).toEqual({ status: "signed_in" });
    expect(otpAuth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("keeps the normal answer when the user has no identities field", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "new" }, session: null }, error: null });
    const response = await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "check_email" });
    expect(otpAuth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("reports an outage as a failed sign-up", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    const response = await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("sign_up_failed");
    expect(otpAuth.signInWithOtp).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("reports signup rate limits", async () => {
    auth.signUp.mockResolvedValue({ error: new AuthApiError("Too many requests", 429, "over_email_send_rate_limit") });
    const response = await signUp(request("/api/v1/auth/password/signup", {
      email: "student@example.com", password: "long-enough-password",
    }));
    expect(response.status).toBe(429);
  });

  it("returns a generic sign-in failure", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error("provider detail") });
    const response = await signIn(request("/api/v1/auth/password/signin", {
      email: "student@example.com", password: "wrong",
    }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_credentials");
  });

  it("reports an unconfirmed email and provider rate limit", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: new AuthApiError("Email not confirmed", 400, "email_not_confirmed") });
    const unconfirmed = await signIn(request("/api/v1/auth/password/signin", {
      email: "student@example.com", password: "long-enough-password",
    }));
    expect(unconfirmed.status).toBe(403);
    expect((await unconfirmed.json()).error.code).toBe("email_not_confirmed");

    auth.signInWithPassword.mockResolvedValueOnce({ error: new AuthApiError("Rate limited", 429, "over_request_rate_limit") });
    const limited = await signIn(request("/api/v1/auth/password/signin", {
      email: "student@example.com", password: "long-enough-password",
    }));
    expect(limited.status).toBe(429);
  });

  it("sends a reset link to the recovery screen", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const response = await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
    expect(response.status).toBe(200);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("student@example.com", {
      redirectTo: "https://cense.example/api/v1/auth/password/reset/verify",
    });
  });

  it("does not reveal whether reset email hit a rate limit", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: new AuthApiError("Rate limited", 429, "over_email_send_rate_limit") });
    const response = await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "check_email" });
  });

  it("verifies a recovery token without a PKCE cookie", async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    const response = await verify(new NextRequest("https://cense.example/api/v1/auth/password/reset/verify?token_hash=abc"));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "recovery" });
    expect(response.headers.get("location")).toBe("https://cense.example/reset-password");
  });

  it("rejects password updates without an authenticated session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", {
      password: "new-long-password",
    }));
    expect(response.status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects password updates from an ordinary email session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id" } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "otp" }] } }, error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", {
      password: "new-long-password",
    }));
    expect(response.status).toBe(403);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates a password with a recovery session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id" } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "recovery" }] } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", {
      password: "new-long-password",
    }));
    expect(response.status).toBe(200);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-long-password" });
  });
});
