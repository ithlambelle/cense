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

import { createHmac } from "node:crypto";

import { authThrottle, clientIp, ipv6Prefix64, throttleEmail, throttleKey, throttleKeys } from "./throttle";

const SECRET = "a-random-secret-of-at-least-32-characters";
const VERCEL = { VERCEL: "1", VERCEL_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "service-key", AUTH_THROTTLE_KEY: SECRET };
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
  it("claims with the service role, the action and keys made from the counted email and the student's IP, with a time limit", async () => {
    database({ data: 0, error: null });
    expect(await authThrottle(request({ "x-forwarded-for": "203.0.113.7" }), "send", "Student+x@Example.com", VERCEL)).toBeNull();
    expect(createServiceClient).toHaveBeenCalledWith("service-key");
    expect(claim).toHaveBeenCalledWith("claim_auth_attempt_hashed", {
      p_action: "send",
      ...throttleKeys(SECRET, "student@example.com", "203.0.113.7"),
    });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("never sends the email, the IP or a plain hash of either to the database", async () => {
    database({ data: 0, error: null });
    await authThrottle(request({ "x-forwarded-for": "203.0.113.7" }), "verify", "student@example.com", VERCEL);
    const sent = JSON.stringify(claim.mock.calls);
    expect(sent).not.toContain("student@example.com");
    expect(sent).not.toContain("203.0.113.7");
    expect(sent).not.toContain(SECRET);
    const { createHash } = await import("node:crypto");
    expect(sent).not.toContain(createHash("sha256").update("student@example.com").digest("hex"));
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

  it("without AUTH_THROTTLE_KEY (or one too short): checks refused on production, a stand-in key elsewhere", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database({ data: 0, error: null });
    const noKey = { ...VERCEL, AUTH_THROTTLE_KEY: undefined };
    expect((await authThrottle(request(), "verify", "student@example.com", noKey))?.status).toBe(503);
    expect((await authThrottle(request(), "password", "student@example.com", { ...VERCEL, AUTH_THROTTLE_KEY: "short" }))?.status).toBe(503);
    expect(await authThrottle(request(), "send", "student@example.com", noKey)).toBeNull();
    expect(claim).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain("AUTH_THROTTLE_KEY");

    // Locally and on previews the limits still count, under the stand-in key.
    expect(await authThrottle(request(), "verify", "student@example.com", { SUPABASE_SERVICE_ROLE_KEY: "service-key" })).toBeNull();
    expect(claim).toHaveBeenCalledWith("claim_auth_attempt_hashed", expect.objectContaining({ p_email_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }));
    log.mockRestore();
  });

  it("on a preview without the key, counts under the stand-in key, exactly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    database({ data: 0, error: null });
    const env = { VERCEL_ENV: "preview", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
    const req = request();
    expect(await authThrottle(req, "verify", "Student@Example.com", env)).toBeNull();
    const expected = throttleKeys("cense-local-auth-throttle-key-not-secret", throttleEmail("Student@Example.com"), clientIp(req.headers, env));
    expect(claim).toHaveBeenCalledWith("claim_auth_attempt_hashed", expect.objectContaining(expected));
  });

  it("logs a key that is set but too short as invalid, not missing", async () => {
    vi.resetModules();
    const fresh = await import("./throttle");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database({ data: 0, error: null });
    await fresh.authThrottle(request(), "verify", "student@example.com", { ...VERCEL, AUTH_THROTTLE_KEY: "short" });
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({ event: "auth_throttle_not_configured", invalid: ["AUTH_THROTTLE_KEY"], reason: "too_short" });
    log.mockRestore();
  });

  it("ignores an answer that is not a wait", async () => {
    database({ data: "0", error: null });
    expect(await authThrottle(request(), "link", null, VERCEL)).toBeNull();
  });
});

describe("throttleKey", () => {
  it("is an HMAC-SHA256 in hex, so the same email gives the same key only with the same secret", () => {
    const key = throttleKey(SECRET, "email", "ana@example.com");
    expect(key).toBe(createHmac("sha256", SECRET).update("email\nana@example.com").digest("hex"));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(throttleKey("another-secret-of-at-least-32-characters", "email", "ana@example.com")).not.toBe(key);
  });

  it("keeps an email, an email with an IP and an IP apart, and treats no IP as an empty one", () => {
    expect(throttleKey(SECRET, "email", "x")).not.toBe(throttleKey(SECRET, "ip", "x"));
    expect(throttleKeys(SECRET, "ana@example.com", null)).toEqual({
      p_email_ip_hash: throttleKey(SECRET, "email_ip", "ana@example.com|"),
      p_email_hash: throttleKey(SECRET, "email", "ana@example.com"),
      p_ip_hash: null,
    });
    expect(throttleKeys(SECRET, null, "203.0.113.7")).toEqual({ p_email_ip_hash: null, p_email_hash: null, p_ip_hash: throttleKey(SECRET, "ip", "203.0.113.7") });
  });
});
