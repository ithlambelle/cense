// Created with Claude Code (2026-11-17). The app-level limits on the sign-in
// routes: which IP is trusted, what reaches the database, and the 429.
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const createServiceClient = vi.hoisted(() => vi.fn(() => ({ rpc })));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));

import { authThrottle, clientIp } from "./throttle";

const VERCEL = { VERCEL: "1", VERCEL_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
const request = (headers: Record<string, string> = {}) => new Request("https://censefinance.com/api/v1/auth/email", { method: "POST", headers });

afterEach(() => vi.clearAllMocks());

describe("clientIp", () => {
  it("reads the first x-forwarded-for value on Vercel, whose edge sets it", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), VERCEL)).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": " 2001:db8::1 " }), VERCEL)).toBe("2001:db8::1");
  });

  it("falls back to x-real-ip, and to nothing for a value that is not an address", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }), VERCEL)).toBe("198.51.100.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "unknown", "x-real-ip": "198.51.100.4" }), VERCEL)).toBe("198.51.100.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "<script>" }), VERCEL)).toBeNull();
    expect(clientIp(new Headers(), VERCEL)).toBeNull();
  });

  it("trusts no header off Vercel, where a client could write any value", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.7" }), {})).toBeNull();
  });
});

describe("authThrottle", () => {
  it("claims with the service role, the action, the email and the student's IP", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    expect(await authThrottle(request({ "x-forwarded-for": "203.0.113.7" }), "send", "student@example.com", VERCEL)).toBeNull();
    expect(createServiceClient).toHaveBeenCalledWith("service-key");
    expect(rpc).toHaveBeenCalledWith("claim_auth_attempt", { p_action: "send", p_email: "student@example.com", p_ip: "203.0.113.7" });
  });

  it("answers 429 in the API's error shape, with Retry-After and the wait in plain words", async () => {
    rpc.mockResolvedValue({ data: 360, error: null });
    const response = await authThrottle(request(), "verify", "student@example.com", VERCEL);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("360");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toEqual({ error: { code: "rate_limited", message: "Too many tries. Try again in 6 minutes." } });

    rpc.mockResolvedValue({ data: 30, error: null });
    expect((await (await authThrottle(request(), "verify", null, VERCEL))?.json()).error.message).toBe("Too many tries. Try again in 1 minute.");
  });

  it("fails open, logging only the error code, when the database call fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "student@example.com" } });
    expect(await authThrottle(request({ "x-forwarded-for": "203.0.113.7" }), "send", "student@example.com", VERCEL)).toBeNull();
    rpc.mockRejectedValue(new TypeError("fetch failed"));
    expect(await authThrottle(request(), "send", "student@example.com", VERCEL)).toBeNull();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("auth_throttle");
    expect(logged).not.toContain("student@example.com");
    expect(logged).not.toContain("203.0.113.7");
    log.mockRestore();
  });

  it("lets every try through without the service role key, and says so once on Vercel", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = { VERCEL_ENV: "production" };
    expect(await authThrottle(request(), "send", "student@example.com", env)).toBeNull();
    expect(await authThrottle(request(), "send", "student@example.com", env)).toBeNull();
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).toContain("SUPABASE_SERVICE_ROLE_KEY");
    log.mockRestore();
  });

  it("ignores an answer that is not a wait", async () => {
    rpc.mockResolvedValue({ data: "0", error: null });
    expect(await authThrottle(request(), "link", null, VERCEL)).toBeNull();
  });
});
