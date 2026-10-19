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
});
