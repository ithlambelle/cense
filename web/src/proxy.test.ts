import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn(async () => new Response("session")));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));

import { config, proxy } from "./proxy";

const SECRET_HEADERS = {
  cookie: "sb-127-auth-token=ACCESS; sb-127-auth-token.0=REFRESH",
  authorization: "Bearer TOKEN",
  referer: "https://censefinance.com/denied/plan?application=1",
};

describe("proxy", () => {
  it("forwards only the allowed headers on analytics requests, and skips the session refresh", async () => {
    const request = new NextRequest("https://censefinance.com/rx/e/?ip=0", {
      method: "POST",
      headers: { ...SECRET_HEADERS, "content-type": "text/plain", "user-agent": "test-agent", "x-forwarded-for": "203.0.113.9" },
    });
    const response = await proxy(request);
    expect(updateSession).not.toHaveBeenCalled();
    // Next lists the request headers it will forward in x-middleware-override-headers.
    const forwarded = (response.headers.get("x-middleware-override-headers") ?? "").split(",").sort();
    expect(forwarded).toEqual(["content-type", "user-agent"]);
    expect(response.headers.get("x-middleware-request-user-agent")).toBe("test-agent");
    expect(response.headers.get("x-middleware-request-x-forwarded-for")).toBeNull();
  });

  it("matches analytics paths that end in an image extension", () => {
    expect(config.matcher.slice(0, 2)).toEqual(["/rx", "/rx/:path*"]);
  });

  it("filters headers on the exact analytics root too", async () => {
    const response = await proxy(new NextRequest("https://censefinance.com/rx", { headers: SECRET_HEADERS }));
    expect(response.headers.get("x-middleware-override-headers")).toBe("");
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("redirects a trailing slash on app pages, keeping the query", async () => {
    const response = await proxy(new NextRequest("https://censefinance.com/cards/?a=1"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://censefinance.com/cards?a=1");
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("refreshes the session on other requests", async () => {
    await proxy(new NextRequest("https://censefinance.com/home"));
    expect(updateSession).toHaveBeenCalledOnce();
  });

  it("gives every page a CSP with a fresh nonce, on the request for Next.js and on the response for the browser", async () => {
    updateSession.mockClear();
    const nonceOf = (policy: string | null) => policy?.match(/'nonce-([^']+)'/)?.[1];
    const first = await proxy(new NextRequest("https://censefinance.com/home"));
    const second = await proxy(new NextRequest("https://censefinance.com/home"));
    const forwarded = (updateSession.mock.calls[0] as unknown as [NextRequest])[0].headers.get("content-security-policy");
    const sent = first.headers.get("content-security-policy");
    expect(nonceOf(sent)).toBeTruthy();
    // The request carries the whole policy, so Next.js finds the same nonce.
    expect(nonceOf(forwarded)).toBe(nonceOf(sent));
    expect(forwarded).toContain("default-src 'self'");
    expect(nonceOf(second.headers.get("content-security-policy"))).not.toBe(nonceOf(sent));
    expect(sent).toContain("frame-ancestors 'none'");
    expect(sent).toContain("report-uri /api/v1/csp-report");
  });

  it("leaves API routes' own CSP alone (the unsubscribe page sets a stricter one)", async () => {
    const strict = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'";
    updateSession.mockImplementationOnce(async () => new Response("page", { headers: { "content-security-policy": strict } }));
    const response = await proxy(new NextRequest("https://censefinance.com/api/v1/reminders/unsubscribe?token=x"));
    expect(response.headers.get("content-security-policy")).toBe(strict);
    expect(response.headers.get("content-security-policy-report-only")).toBeNull();
    const json = await proxy(new NextRequest("https://censefinance.com/api/v1/quiz"));
    expect(json.headers.get("content-security-policy")).toBeNull();
  });

  it("sends CSP reports straight on, with no session refresh", async () => {
    updateSession.mockClear();
    await proxy(new NextRequest("https://censefinance.com/api/v1/csp-report", { method: "POST" }));
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("reports, but does not enforce, script-src on Vercel previews", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await proxy(new NextRequest("https://censefinance.com/home"));
    vi.unstubAllEnvs();
    expect(response.headers.get("content-security-policy")).not.toContain("script-src");
    expect(response.headers.get("content-security-policy-report-only")).toContain("'strict-dynamic'");
  });
});
