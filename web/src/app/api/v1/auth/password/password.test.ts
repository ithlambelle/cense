import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
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
  signOut: vi.fn(),
}));

// The sign-in code for an existing account goes through the cookieless client.
const otpAuth = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));

// The reset link's session, held back until commit() (createDeferredStudentClient).
const deferred = vi.hoisted(() => ({
  auth: { verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn(), signOut: vi.fn() },
  commit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createStudentClient: async () => ({ auth }),
  createCookielessClient: () => ({ auth: otpAuth }),
  createDeferredStudentClient: async () => ({ client: { auth: deferred.auth }, commit: deferred.commit }),
}));

// The app-level limits (src/lib/auth/throttle.ts, tested there): let through
// unless a test says otherwise.
const throttle = vi.hoisted(() => ({
  authThrottle: vi.fn<(...args: unknown[]) => Promise<Response | null>>(async () => null),
  codeSent: vi.fn(async () => {}),
  codeCheckPassed: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/throttle", () => throttle);

import { POST as signUp } from "./signup/route";
import { POST as confirmSignUp } from "./signup/confirm/route";
import { POST as signIn } from "./signin/route";
import { POST as reset } from "./reset/route";
import { POST as confirm } from "./reset/confirm/route";
import { GET as openLink, POST as verifyLink } from "./reset/verify/route";

function request(path: string, payload: unknown): Request {
  return new Request(`https://cense.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

const LIMITED = () => Response.json({ error: { code: "rate_limited", message: "Too many tries. Try again in 6 minutes." } }, { status: 429 });

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

  describe("confirming a password sign-up", () => {
    const CONFIRM_BODY = { email: "student@example.com", code: "123456", password: "long-enough-password" };
    // Timestamps as Supabase returns them from verifying a code.
    const FIRST_CONFIRMATION = { email_confirmed_at: "2026-10-24T18:03:31.266909Z", last_sign_in_at: "2026-10-24T18:03:31.269723294Z" };
    const CONFIRMED_EARLIER = { email_confirmed_at: "2026-10-01T09:00:00.000000Z", last_sign_in_at: "2026-10-24T18:03:34.627138212Z" };

    it("verifies the code, then sets the chosen password, then ends other sessions", async () => {
      auth.verifyOtp.mockResolvedValue({ data: { user: FIRST_CONFIRMATION }, error: null });
      auth.updateUser.mockResolvedValue({ data: {}, error: null });
      auth.signOut.mockResolvedValue({ error: null });
      const response = await confirmSignUp(request("/api/v1/auth/password/signup/confirm", CONFIRM_BODY));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "signed_in", passwordChanged: true });
      expect(auth.verifyOtp).toHaveBeenCalledWith({ email: "student@example.com", token: "123456", type: "email" });
      expect(auth.updateUser).toHaveBeenCalledWith({ password: "long-enough-password" });
      expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
      expect(auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
      expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0]);
    });

    it("never changes the password or other sessions of an account confirmed earlier", async () => {
      auth.verifyOtp.mockResolvedValue({ data: { user: CONFIRMED_EARLIER }, error: null });
      const response = await confirmSignUp(request("/api/v1/auth/password/signup/confirm", CONFIRM_BODY));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "signed_in", passwordChanged: false });
      expect(auth.updateUser).not.toHaveBeenCalled();
      expect(auth.signOut).not.toHaveBeenCalled();
    });

    it("sets no password when the code is wrong", async () => {
      auth.verifyOtp.mockResolvedValue({ data: {}, error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired") });
      const response = await confirmSignUp(request("/api/v1/auth/password/signup/confirm", CONFIRM_BODY));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("invalid_code");
      expect(auth.updateUser).not.toHaveBeenCalled();
    });

    it("signs the student in when the account already has that password", async () => {
      auth.verifyOtp.mockResolvedValue({ data: { user: FIRST_CONFIRMATION }, error: null });
      auth.updateUser.mockResolvedValue({ data: {}, error: new AuthApiError("New password should be different from the old password.", 422, "same_password") });
      auth.signOut.mockResolvedValue({ error: null });
      const response = await confirmSignUp(request("/api/v1/auth/password/signup/confirm", CONFIRM_BODY));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "signed_in", passwordChanged: true });
      expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    });

    it("leaves no session when the password cannot be set", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      auth.verifyOtp.mockResolvedValue({ data: { user: FIRST_CONFIRMATION }, error: null });
      auth.updateUser.mockResolvedValue({ data: {}, error: new AuthApiError("Password is known to be weak", 422, "weak_password") });
      auth.signOut.mockResolvedValue({ error: null });
      const response = await confirmSignUp(request("/api/v1/auth/password/signup/confirm", CONFIRM_BODY));
      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe("password_update_failed");
      expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(JSON.stringify(log.mock.calls)).not.toContain("student@example.com");
      log.mockRestore();
    });

    it("checks the request before calling the provider", async () => {
      const response = await confirmSignUp(request("/api/v1/auth/password/signup/confirm", { email: "student@example.com", code: "123456", password: "short" }));
      expect(response.status).toBe(400);
      expect(auth.verifyOtp).not.toHaveBeenCalled();
    });
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

  it("sends a reset link to the confirm screen, on this address when no APP_BASE_URL is set (local runs)", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const response = await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
    expect(response.status).toBe(200);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("student@example.com", {
      redirectTo: "https://cense.example/reset-password/confirm",
    });
  });

  // External audit of a8fe7d4: the link was built from the request's own
  // address, which its Host header decides.
  it("builds the reset link from APP_BASE_URL, never the request's address", async () => {
    vi.stubEnv("APP_BASE_URL", "https://censefinance.com/");
    vi.stubEnv("VERCEL_ENV", "production");
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("student@example.com", {
      redirectTo: "https://censefinance.com/reset-password/confirm",
    });
  });

  it("sends no reset email on production without APP_BASE_URL", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
    expect(response.status).toBe(502);
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain("APP_BASE_URL");
    expect(JSON.stringify(log.mock.calls)).not.toContain("student@example.com");
    log.mockRestore();
  });

  it("builds the sign-up email's link from APP_BASE_URL too", async () => {
    vi.stubEnv("APP_BASE_URL", "https://censefinance.com");
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: { emailRedirectTo: "https://censefinance.com/api/v1/auth/callback?next=%2Fsign-in%3Fconfirmed%3D1" },
    }));
  });

  it("leaves the sign-up email's link to Supabase's Site URL on production without APP_BASE_URL", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VERCEL_ENV", "production");
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const response = await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
    expect(response.status).toBe(200);
    expect(auth.signUp).toHaveBeenCalledWith({ ...SIGN_UP_BODY, options: undefined });
    log.mockRestore();
  });

  describe("app-level limits", () => {
    it("counts each route under its own action, with the email the request names", async () => {
      auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
      auth.signInWithPassword.mockResolvedValue({ error: null });
      auth.resetPasswordForEmail.mockResolvedValue({ error: null });
      auth.verifyOtp.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-01T09:00:00Z", last_sign_in_at: "2026-11-17T09:00:00Z" } }, error: null });
      await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
      await signIn(request("/api/v1/auth/password/signin", SIGN_UP_BODY));
      await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
      await confirmSignUp(request("/api/v1/auth/password/signup/confirm", { ...SIGN_UP_BODY, code: "123456" }));
      expect(throttle.authThrottle.mock.calls.map(([, action, email]) => [action, email])).toEqual([
        ["send", "student@example.com"],
        ["password", "student@example.com"],
        ["send", "student@example.com"],
        ["verify", "student@example.com"],
      ]);
    });

    it("answers 429 with the plain message, before Supabase is called", async () => {
      throttle.authThrottle.mockImplementation(async () => LIMITED());
      const answers = [
        await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY)),
        await signIn(request("/api/v1/auth/password/signin", SIGN_UP_BODY)),
        await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" })),
        await confirmSignUp(request("/api/v1/auth/password/signup/confirm", { ...SIGN_UP_BODY, code: "123456" })),
        await verifyLink(request("/api/v1/auth/password/reset/verify", { tokenHash: "abc" })),
      ];
      for (const answer of answers) {
        expect(answer.status).toBe(429);
        expect((await answer.json()).error).toEqual({ code: "rate_limited", message: "Too many tries. Try again in 6 minutes." });
      }
      expect(auth.signUp).not.toHaveBeenCalled();
      expect(auth.signInWithPassword).not.toHaveBeenCalled();
      expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
      expect(auth.verifyOtp).not.toHaveBeenCalled();
      expect(deferred.auth.verifyOtp).not.toHaveBeenCalled();
      throttle.authThrottle.mockImplementation(async () => null);
    });

    it("passes on a refusal when the count cannot be checked (sign_in_busy), before Supabase is called", async () => {
      throttle.authThrottle.mockImplementation(async () =>
        Response.json({ error: { code: "sign_in_busy", message: "Sign-in is busy right now. Try again in a minute." } }, { status: 503 }));
      const answer = await signIn(request("/api/v1/auth/password/signin", SIGN_UP_BODY));
      expect(answer.status).toBe(503);
      expect((await answer.json()).error.code).toBe("sign_in_busy");
      expect(auth.signInWithPassword).not.toHaveBeenCalled();
      throttle.authThrottle.mockImplementation(async () => null);
    });

    it("starts the email's code count again after every sign-up that sends a code, new account or not", async () => {
      auth.signUp.mockResolvedValue(NEW_STUDENT);
      await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
      auth.signUp.mockResolvedValue(EXISTING["a placeholder user with no identities (confirmation on)"]);
      otpAuth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
      await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
      expect(throttle.codeSent.mock.calls).toEqual([["student@example.com"], ["student@example.com"]]);
    });

    it("keeps the count when no code went out, and a reset email never restarts it", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      auth.signUp.mockResolvedValue(EXISTING["a placeholder user with no identities (confirmation on)"]);
      otpAuth.signInWithOtp.mockResolvedValue({ data: {}, error: new AuthApiError("Too many requests", 429, "over_email_send_rate_limit") });
      await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
      auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: new AuthApiError("Too many requests", 429, "over_email_send_rate_limit") });
      await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
      auth.signUp.mockResolvedValue({ data: { user: { id: "new", identities: [{ provider: "email" }] }, session: {} }, error: null });
      await signUp(request("/api/v1/auth/password/signup", SIGN_UP_BODY));
      auth.resetPasswordForEmail.mockResolvedValue({ error: null });
      await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
      expect(throttle.codeSent).not.toHaveBeenCalled();
      log.mockRestore();
    });

    it("gives a sign-up code check's place back only when the code was right", async () => {
      auth.verifyOtp.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired") });
      await confirmSignUp(request("/api/v1/auth/password/signup/confirm", { ...SIGN_UP_BODY, code: "123456" }));
      expect(throttle.codeCheckPassed).not.toHaveBeenCalled();
      auth.verifyOtp.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-01T09:00:00Z", last_sign_in_at: "2026-11-17T09:00:00Z" } }, error: null });
      await confirmSignUp(request("/api/v1/auth/password/signup/confirm", { ...SIGN_UP_BODY, code: "123456" }));
      expect(throttle.codeCheckPassed).toHaveBeenCalledOnce();
    });

    it("does not count a request that fails validation", async () => {
      await signUp(request("/api/v1/auth/password/signup", { email: "student@example.com", password: "short" }));
      await verifyLink(request("/api/v1/auth/password/reset/verify", { tokenHash: "" }));
      expect(throttle.authThrottle).not.toHaveBeenCalled();
    });
  });

  it("does not reveal whether reset email hit a rate limit", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: new AuthApiError("Rate limited", 429, "over_email_send_rate_limit") });
    const response = await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "check_email" });
  });

  describe("opening a reset link (login CSRF, external audit of a8fe7d4)", () => {
    const LINK_USER = { id: "link-owner", email: "owner@example.com" };

    it("GET verifies nothing: an older link, or a mail scanner, only reaches the confirm screen", async () => {
      const response = openLink(new NextRequest("https://cense.example/api/v1/auth/password/reset/verify?token_hash=abc&next=//evil.example"));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://cense.example/reset-password/confirm?token_hash=abc");
      expect(auth.verifyOtp).not.toHaveBeenCalled();
      expect(deferred.auth.verifyOtp).not.toHaveBeenCalled();
      expect(openLink(new NextRequest("https://cense.example/api/v1/auth/password/reset/verify?code=c1")).headers.get("location"))
        .toBe("https://cense.example/reset-password/confirm?code=c1");
    });

    it("POST verifies the link and starts its session when no one is signed in, without a PKCE cookie", async () => {
      auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      deferred.auth.verifyOtp.mockResolvedValue({ data: { user: LINK_USER, session: {} }, error: null });
      const response = await verifyLink(request("/api/v1/auth/password/reset/verify", { tokenHash: "abc" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ status: "verified" });
      expect(deferred.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "recovery" });
      expect(deferred.commit).toHaveBeenCalledOnce();
      expect(throttle.authThrottle).toHaveBeenCalledWith(expect.any(Request), "link", null);
    });

    it("lets the same student, already signed in, reset their own password", async () => {
      auth.getUser.mockResolvedValue({ data: { user: { id: "link-owner" } }, error: null });
      deferred.auth.verifyOtp.mockResolvedValue({ data: { user: LINK_USER, session: {} }, error: null });
      const response = await verifyLink(request("/api/v1/auth/password/reset/verify", { tokenHash: "abc" }));
      expect(response.status).toBe(200);
      expect(deferred.commit).toHaveBeenCalledOnce();
    });

    it("treats a browser with no session as signed out", async () => {
      auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
      deferred.auth.verifyOtp.mockResolvedValue({ data: { user: LINK_USER, session: {} }, error: null });
      const response = await verifyLink(request("/api/v1/auth/password/reset/verify", { tokenHash: "abc" }));
      expect(response.status).toBe(200);
      expect(deferred.commit).toHaveBeenCalledOnce();
    });

    // Any other failure could hide a signed-in student, whose session must not be replaced.
    for (const [what, failure] of [
      ["Auth is down", new AuthRetryableFetchError("fetch failed", 0)],
      ["Auth rejects the token", new AuthApiError("invalid JWT", 403, "bad_jwt")],
    ] as const) {
      it(`refuses, before the link is used, when it cannot tell who is signed in (${what})`, async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        auth.getUser.mockResolvedValue({ data: { user: null }, error: failure });
        const response = await verifyLink(request("/api/v1/auth/password/reset/verify", { tokenHash: "abc" }));
        expect(response.status).toBe(503);
        expect((await response.json()).error).toEqual({
          code: "session_check_failed",
          message: "We couldn’t check who’s logged in here. Try again in a minute.",
        });
        expect(deferred.auth.verifyOtp).not.toHaveBeenCalled();
        expect(deferred.commit).not.toHaveBeenCalled();
        log.mockRestore();
      });
    }

    it("refuses when a different student is signed in, and leaves their session as it was", async () => {
      auth.getUser.mockResolvedValue({ data: { user: { id: "victim" } }, error: null });
      deferred.auth.verifyOtp.mockResolvedValue({ data: { user: LINK_USER, session: {} }, error: null });
      deferred.auth.signOut.mockResolvedValue({ error: null });
      const response = await verifyLink(request("/api/v1/auth/password/reset/verify", { tokenHash: "attackers-link" }));
      expect(response.status).toBe(409);
      expect((await response.json()).error).toEqual({
        code: "signed_in_as_other",
        message: "You’re logged in to a different account. Log out, then ask for a new reset link.",
      });
      expect(deferred.commit).not.toHaveBeenCalled();
      // The link's own session is ended, not handed over.
      expect(deferred.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(auth.signOut).not.toHaveBeenCalled();
    });

    it("says the link expired when it is used or too old", async () => {
      auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      deferred.auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired") });
      const response = await verifyLink(request("/api/v1/auth/password/reset/verify", { tokenHash: "used" }));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("invalid_link");
      expect(deferred.commit).not.toHaveBeenCalled();
    });

    it("exchanges Supabase's own code in the browser that asked", async () => {
      auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      deferred.auth.exchangeCodeForSession.mockResolvedValue({ data: { user: LINK_USER, session: {} }, error: null });
      const response = await verifyLink(request("/api/v1/auth/password/reset/verify", { code: "c1" }));
      expect(response.status).toBe(200);
      expect(deferred.auth.exchangeCodeForSession).toHaveBeenCalledWith("c1");
      expect(deferred.commit).toHaveBeenCalledOnce();
    });

    it("takes a JSON body with exactly one of tokenHash or code", async () => {
      for (const payload of [{}, { tokenHash: "a", code: "b" }, { token_hash: "a" }]) {
        expect((await verifyLink(request("/api/v1/auth/password/reset/verify", payload))).status, JSON.stringify(payload)).toBe(400);
      }
      const form = new Request("https://cense.example/api/v1/auth/password/reset/verify", {
        method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ tokenHash: "abc" }),
      });
      expect((await verifyLink(form)).status).toBe(400);
      expect(deferred.auth.verifyOtp).not.toHaveBeenCalled();
    });
  });

  it("rejects password updates without an authenticated session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", {
      password: "new-long-password",
    }));
    expect(response.status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  // Seconds since 1970, as Supabase writes amr timestamps.
  const now = () => Math.floor(Date.now() / 1000);

  it("rejects password updates from an ordinary email session that began before the reset email", async () => {
    const sentAt = new Date(Date.now() - 60_000).toISOString();
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id", recovery_sent_at: sentAt } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "otp", timestamp: now() - 600 }] } }, error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", {
      password: "new-long-password",
    }));
    expect(response.status).toBe(403);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects an email session when no reset email was ever sent", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id", recovery_sent_at: null } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "otp", timestamp: now() }] } }, error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", { password: "new-long-password" }));
    expect(response.status).toBe(403);
  });

  // The app's own reset link (token_hash) gives the session Supabase's "otp" method.
  it("updates a password from a session the reset link opened, in any browser", async () => {
    const sentAt = new Date(Date.now() - 60_000).toISOString();
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id", recovery_sent_at: sentAt } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "otp", timestamp: now() - 30 }] } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", { password: "new-long-password" }));
    expect(response.status).toBe(200);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-long-password" });
  });

  it("updates a password with a recovery session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id" } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "recovery", timestamp: now() }] } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", {
      password: "new-long-password",
    }));
    expect(response.status).toBe(200);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-long-password" });
  });

  it("rejects a reset session older than the 10 minutes the link lasts", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id", recovery_sent_at: new Date(Date.now() - 7_200_000).toISOString() } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "recovery", timestamp: now() - 3_700 }] } }, error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", { password: "new-long-password" }));
    expect(response.status).toBe(403);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects password and Google sessions", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id", recovery_sent_at: new Date().toISOString() } }, error: null });
    for (const method of ["password", "oauth"]) {
      auth.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method, timestamp: now() }] } }, error: null });
      const response = await confirm(request("/api/v1/auth/password/reset/confirm", { password: "new-long-password" }));
      expect(response.status, method).toBe(403);
    }
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
