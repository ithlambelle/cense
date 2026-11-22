// Created with Claude Code (2026-11-17).
import { describe, expect, it } from "vitest";

import { MAX_REPORT_BYTES, MAX_VIOLATIONS, parseReport, readCapped } from "./csp-report";

const LEGACY = {
  "csp-report": {
    "document-uri": "https://censefinance.com/sign-in?code=123456&next=%2Fhome",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.example/steal.js?token=abc",
    disposition: "enforce",
  },
};

const reportingApi = (overrides: Record<string, unknown> = {}) => ({
  type: "csp-violation",
  url: "https://censefinance.com/home?x=1",
  body: {
    documentURL: "https://censefinance.com/safe-to-spend/connect?session=s3cret",
    effectiveDirective: "connect-src",
    blockedURL: "https://api.example.com/v1/x?key=k",
    disposition: "report",
    ...overrides,
  },
});

describe("parseReport", () => {
  it("keeps only the rule, the blocked origin and the page path from a report-uri report", () => {
    const [violation] = parseReport("application/csp-report", JSON.stringify(LEGACY));
    expect(violation).toEqual({ directive: "script-src-elem", blocked: "https://evil.example", page: "/sign-in", disposition: "enforce" });
    expect(JSON.stringify(violation)).not.toMatch(/123456|token|abc|code/);
  });

  it("reads the Reporting API's format, csp-violation entries only", () => {
    const body = JSON.stringify([reportingApi(), { type: "deprecation", body: {} }]);
    expect(parseReport("application/reports+json", body)).toEqual([
      { directive: "connect-src", blocked: "https://api.example.com", page: "/safe-to-spend/connect", disposition: "report" },
    ]);
  });

  it("keeps keywords such as inline and eval, and never a data: or blob: payload", () => {
    const blocked = (value: string) => parseReport("application/reports+json", JSON.stringify([reportingApi({ blockedURL: value })]))[0].blocked;
    expect(blocked("inline")).toBe("inline");
    expect(blocked("eval")).toBe("eval");
    expect(blocked("data:text/html;base64,PHNjcmlwdD4=")).toBe("data:");
    expect(blocked("not a url at all")).toBe("other");
  });

  it("logs at most a few violations per request and ignores what is not a report", () => {
    const many = JSON.stringify(Array.from({ length: 50 }, () => reportingApi()));
    expect(parseReport("application/reports+json", many)).toHaveLength(MAX_VIOLATIONS);
    expect(parseReport("application/csp-report", "{not json")).toEqual([]);
    expect(parseReport("application/csp-report", JSON.stringify({ other: 1 }))).toEqual([]);
    expect(parseReport("application/reports+json", JSON.stringify({ type: "csp-violation" }))).toEqual([]);
  });

  it("cuts long fields", () => {
    const [violation] = parseReport("application/reports+json", JSON.stringify([reportingApi({ effectiveDirective: "x".repeat(5000) })]));
    expect(violation.directive.length).toBeLessThanOrEqual(100);
  });
});

describe("readCapped", () => {
  it("reads a body up to the cap", async () => {
    expect(await readCapped(new Request("https://x.test", { method: "POST", body: "hello" }))).toBe("hello");
  });

  it("refuses a body over the cap, by its declared length or as it streams", async () => {
    const big = "a".repeat(MAX_REPORT_BYTES + 1);
    expect(await readCapped(new Request("https://x.test", { method: "POST", body: big }))).toBeNull();
    const declared = new Request("https://x.test", { method: "POST", body: "small", headers: { "content-length": String(MAX_REPORT_BYTES * 10) } });
    expect(await readCapped(declared)).toBeNull();
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < 20; i++) controller.enqueue(new TextEncoder().encode("b".repeat(1024)));
        controller.close();
      },
    });
    expect(await readCapped(new Request("https://x.test", { method: "POST", body: stream, duplex: "half" } as RequestInit))).toBeNull();
  });
});
