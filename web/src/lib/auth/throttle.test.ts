// Created with Claude Code (2026-11-17). The app-level limits on the sign-in
// routes: which IP is trusted and how it is grouped, how an email is counted,
// what reaches the database, the 429, and what happens when the count cannot
// be checked.
import { afterEach, describe, expect, it, vi } from "vitest";

const claim = vi.hoisted(() => vi.fn());
const abortSignal = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const createServiceClient = vi.hoisted(() => vi.fn(() => ({ rpc })));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));

import { authThrottle, clientIp, ipv6Prefix64, throttleEmail } from "./throttle";

const VERCEL = { VERCEL: "1", VERCEL_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
const request = (headers: Record<string, string> = {}) => new Request("https://censefinance.com/api/v1/auth/email", { method: "POST", headers });

// The database answers `answer` (or throws it) once the call is made.
function database(answer: { data: unknown; error: unknown } | Error) {
  abortSignal.mockImplementation(() => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)));
  rpc.mockImplementation((...args: unknown[]) => {
    claim(...args);
    return { abortSignal };
  });
}

afterEach(() => vi.clearAllMocks());

describe("throttleEmail", () => {
  it("counts an email lowercased, trimmed and without a +tag", () => {
    expect(throttleEmail(" Ana+Promo@Example.COM ")).toBe("ana@example.com");
    expect(throttleEmail("ana+1@example.com")).toBe(throttleEmail("ana+2@example.com"));
    expect(throttleEmail("ana@example.com")).toBe("ana@example.com");
    expect(throttleEmail("a.b@sub.example.com")).toBe("a.b@sub.example.com");
    expect(throttleEmail("  ")).toBeNull();
    expect(throttleEmail(null)).toBeNull();
  });
});

describe("ipv6Prefix64", () => {
  it("groups an IPv6 address by its /64, however it is written", () => {
    expect(ipv6Prefix64("2001:db8:0:1:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:0:1::/64");
    expect(ipv6Prefix64("2001:0DB8:0000:0001::1")).toBe("2001:db8:0:1::/64");
    expect(ipv6Prefix64("2001:db8:0:1::ffff:1.2.3.4")).toBe("2001:db8:0:1::/64");
    expect(ipv6Prefix64("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(ipv6Prefix64("::1")).toBe("0:0:0:0::/64");
    expect(ipv6Prefix64("fe80::1%en0")).toBe("fe80:0:0:0::/64");
  });

  it("is null for anything that is not IPv6", () => {
    expect(ipv6Prefix64("203.0.113.7")).toBeNull();
    expect(ipv6Prefix64("2001:db8::1::2")).toBeNull();
    expect(ipv6Prefix64("not an address")).toBeNull();
  });
});

describe("clientIp", () => {
  it("reads the first x-forwarded-for value on Vercel, whose edge sets it", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), VERCEL)).toBe("203.0.113.7");
  });

  it("counts two addresses in one IPv6 /64 as one, and an IPv4-mapped address as IPv4", () => {
    const first = clientIp(new Headers({ "x-forwarded-for": "2001:db8:0:1::a" }), VERCEL);
    const second = clientIp(new Headers({ "x-forwarded-for": " 2001:db8:0:1:ffff::b " }), VERCEL);
    expect(first).toBe("2001:db8:0:1::/64");
    expect(second).toBe(first);
    expect(clientIp(new Headers({ "x-forwarded-for": "2001:db8:0:2::a" }), VERCEL)).not.toBe(first);
    expect(clientIp(new Headers({ "x-forwarded-for": "::ffff:203.0.113.7" }), VERCEL)).toBe("203.0.113.7");
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
  it("claims with the service role, the action, the counted email and the student's IP, with a time limit", async () => {
    database({ data: 0, error: null });
    expect(await authThrottle(request({ "x-forwarded-for": "203.0.113.7" }), "send", "Student+x@Example.com", VERCEL)).toBeNull();
    expect(createServiceClient).toHaveBeenCalledWith("service-key");
    expect(claim).toHaveBeenCalledWith("claim_auth_attempt", { p_action: "send", p_email: "student@example.com", p_ip: "203.0.113.7" });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("answers 429 in the API's error shape, with Retry-After and the wait in plain words", async () => {
    database({ data: 360, error: null });
    const response = await authThrottle(request(), "verify", "student@example.com", VERCEL);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("360");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toEqual({ error: { code: "rate_limited", message: "Too many tries. Try again in 6 minutes." } });

    database({ data: 30, error: null });
    expect((await (await authThrottle(request(), "verify", null, VERCEL))?.json()).error.message).toBe("Too many tries. Try again in 1 minute.");

    // The daily cap on code checks.
    database({ data: 68_400, error: null });
    const daily = await authThrottle(request(), "verify", "student@example.com", VERCEL);
    expect(daily?.headers.get("Retry-After")).toBe("68400");
    expect((await daily?.json()).error.message).toBe("Too many tries. Try again in 19 hours.");
  });

  // A flood that makes the claim fail or time out must not switch the limits off for guessing.
  for (const [what, answer] of [
    ["the database call fails", { data: null, error: { code: "55P03", message: "student@example.com" } }],
    ["the call is cut off or cannot connect", new DOMException("The operation timed out.", "TimeoutError")],
  ] as const) {
    it(`refuses code and password checks with a calm 503 when ${what}, and lets emails and reset links through`, async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      database(answer as { data: unknown; error: unknown } | Error);
      for (const action of ["verify", "password"] as const) {
        const response = await authThrottle(request({ "x-forwarded-for": "203.0.113.7" }), action, "student@example.com", VERCEL);
        expect(response?.status, action).toBe(503);
        expect(response?.headers.get("Retry-After")).toBe("60");
        expect(await response?.json()).toEqual({ error: { code: "sign_in_busy", message: "Sign-in is busy right now. Try again in a minute." } });
      }
      expect(await authThrottle(request(), "send", "student@example.com", VERCEL)).toBeNull();
      expect(await authThrottle(request(), "link", null, VERCEL)).toBeNull();
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain("auth_throttle");
      expect(logged).not.toContain("student@example.com");
      expect(logged).not.toContain("203.0.113.7");
      log.mockRestore();
    });
  }

  it("without the service role key: no limits locally or on previews, checks refused on production", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await authThrottle(request(), "verify", "student@example.com", {})).toBeNull();
    expect(await authThrottle(request(), "verify", "student@example.com", { VERCEL_ENV: "preview" })).toBeNull();
    expect((await authThrottle(request(), "verify", "student@example.com", { VERCEL_ENV: "production" }))?.status).toBe(503);
    expect(await authThrottle(request(), "send", "student@example.com", { VERCEL_ENV: "production" })).toBeNull();
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).toContain("SUPABASE_SERVICE_ROLE_KEY");
    log.mockRestore();
  });

  it("ignores an answer that is not a wait", async () => {
    database({ data: "0", error: null });
    expect(await authThrottle(request(), "link", null, VERCEL)).toBeNull();
  });
});
