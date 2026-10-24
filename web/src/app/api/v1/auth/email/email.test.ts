import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";

const auth = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createStudentClient: async () => ({ auth }) }));

import { POST as verify } from "./verify/route";

const BODY = { email: "student@example.com", code: "123456" };
// Timestamps as Supabase returns them from verifying a code.
const FIRST_CONFIRMATION = { email_confirmed_at: "2026-10-24T18:03:31.266909Z", last_sign_in_at: "2026-10-24T18:03:31.269723294Z" };
const CONFIRMED_EARLIER = { email_confirmed_at: "2026-10-01T09:00:00.000000Z", last_sign_in_at: "2026-10-24T18:03:34.627138212Z" };

function request(payload: unknown): Request {
  return new Request("https://cense.example/api/v1/auth/email/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("verifying an email code", () => {
  it("keeps the password of an account confirmed earlier", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: CONFIRMED_EARLIER }, error: null });
    const response = await verify(request(BODY));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "signed_in" });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: "student@example.com", token: "123456", type: "email" });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("replaces a password set before this code confirmed the account, then ends other sessions", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: FIRST_CONFIRMATION }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    const response = await verify(request(BODY));
    expect(response.status).toBe(200);
    const password = auth.updateUser.mock.calls[0][0].password as string;
    expect(password.length).toBeGreaterThanOrEqual(40);
    expect(new TextEncoder().encode(password).length).toBeLessThanOrEqual(72);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
    expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0]);
  });

  it("uses a different password every time", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: FIRST_CONFIRMATION }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    await verify(request(BODY));
    await verify(request(BODY));
    expect(auth.updateUser.mock.calls[0][0].password).not.toBe(auth.updateUser.mock.calls[1][0].password);
  });

  it("changes nothing when the code is wrong", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired") });
    const response = await verify(request(BODY));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_code");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("leaves no session when the password cannot be replaced", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.verifyOtp.mockResolvedValue({ data: { user: FIRST_CONFIRMATION }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: new AuthApiError("Unexpected failure", 500, "unexpected_failure") });
    auth.signOut.mockResolvedValue({ error: null });
    const response = await verify(request(BODY));
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("password_update_failed");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("student@example.com");
    log.mockRestore();
  });

  it("checks the request before calling the provider", async () => {
    const response = await verify(request({ email: "student@example.com", code: "12345" }));
    expect(response.status).toBe(400);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});
