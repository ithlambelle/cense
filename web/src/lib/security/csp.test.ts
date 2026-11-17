// Created with Claude Code (2026-11-17).
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createNonce, CSP_REPORT_PATH, ENFORCE_FULL_POLICY } from "./csp";

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

describe("preview deployments", () => {
  it("only report script-src, so Vercel's toolbar loads, and still enforce the rest", () => {
    const { enforced, reportOnly, request } = contentSecurityPolicy("n", { preview: true });
    expect(directives(enforced).has("script-src")).toBe(false);
    expect(directives(enforced).get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives(enforced).get("object-src")).toEqual(["'none'"]);
    expect(directives(reportOnly ?? "").get("script-src")).toContain("'nonce-n'");
    // Next.js still finds the nonce, so the app's own scripts never report.
    expect(directives(request).get("script-src")).toContain("'nonce-n'");
  });

  it("are the only place script-src is not enforced", () => {
    expect(directives(contentSecurityPolicy("n").enforced).get("script-src")).toContain("'nonce-n'");
  });
});

describe("reports", () => {
  it("go to the app's report route from both headers, by report-uri only", () => {
    for (const options of [{}, { preview: true }]) {
      const { enforced, reportOnly } = contentSecurityPolicy("n", options);
      for (const policy of [enforced, reportOnly ?? enforced]) {
        expect(directives(policy).get("report-uri")).toEqual([CSP_REPORT_PATH]);
        // report-to would make Chrome ignore report-uri.
        expect(directives(policy).has("report-to")).toBe(false);
      }
    }
  });
});

describe("createNonce", () => {
  it("is 16 random bytes, different every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(atob(nonce)).toHaveLength(16);
  });
});
