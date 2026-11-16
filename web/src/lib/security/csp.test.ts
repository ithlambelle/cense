// Created with Claude Code (2026-11-17).
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createNonce, ENFORCE_FULL_POLICY } from "./csp";

function directives(policy: string): Map<string, string[]> {
  return new Map(policy.split("; ").map((part) => {
    const [name, ...sources] = part.split(" ");
    return [name, sources];
  }));
}

describe("contentSecurityPolicy", () => {
  it("runs only scripts with this response's nonce, and never inline or eval'd code in production", () => {
    const { enforced } = contentSecurityPolicy("abc123");
    const script = directives(enforced).get("script-src");
    expect(script).toEqual(["'nonce-abc123'", "'strict-dynamic'", "'self'", "https://cdn.plaid.com"]);
    expect(enforced).not.toContain("unsafe-inline");
    expect(enforced).not.toContain("unsafe-eval");
  });

  it("allows eval only under next dev, which React's dev tools need", () => {
    expect(directives(contentSecurityPolicy("n", { dev: true }).enforced).get("script-src")).toContain("'unsafe-eval'");
  });

  it("enforces no plugins, no foreign <base> or form targets, and no framing", () => {
    const enforced = directives(contentSecurityPolicy("n").enforced);
    expect(enforced.get("object-src")).toEqual(["'none'"]);
    expect(enforced.get("base-uri")).toEqual(["'self'"]);
    expect(enforced.get("form-action")).toEqual(["'self'"]);
    expect(enforced.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("lists only the app and Plaid Link as places the page may reach", () => {
    const { enforced, reportOnly } = contentSecurityPolicy("n");
    const full = directives(ENFORCE_FULL_POLICY ? enforced : (reportOnly ?? ""));
    expect(full.get("default-src")).toEqual(["'self'"]);
    expect(full.get("connect-src")).toEqual(["'self'", "https://sandbox.plaid.com", "https://production.plaid.com"]);
    expect(full.get("frame-src")).toEqual(["https://cdn.plaid.com"]);
    expect(full.get("font-src")).toEqual(["'self'"]);
    expect(full.get("script-src")).toEqual(directives(enforced).get("script-src"));
    // PostHog only through the app's own /rx proxy; Supabase only from the server.
    expect(ENFORCE_FULL_POLICY ? enforced : reportOnly).not.toMatch(/posthog|supabase|\*/);
  });
});

describe("createNonce", () => {
  it("is 16 random bytes, different every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(atob(nonce)).toHaveLength(16);
  });
});
