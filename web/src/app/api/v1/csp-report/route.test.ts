// Created with Claude Code (2026-11-17).
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const report = JSON.stringify({
  "csp-report": {
    "document-uri": "https://censefinance.com/sign-in?code=123456",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.example/x.js?t=1",
    disposition: "enforce",
  },
});

const post = (body: string, type: string) => POST(new Request("https://censefinance.com/api/v1/csp-report", { method: "POST", body, headers: { "content-type": type } }));

afterEach(() => vi.restoreAllMocks());

describe("POST /api/v1/csp-report", () => {
  it("logs one line with the rule, the blocked origin and the path, and answers 204", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await post(report, "application/csp-report");
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledOnce();
    const line = JSON.parse(warn.mock.calls[0][0] as string);
    expect(line).toEqual({
      event: "csp_violation",
      violations: [{ directive: "script-src-elem", blocked: "https://evil.example", page: "/sign-in", disposition: "enforce" }],
    });
    expect(warn.mock.calls[0][0]).not.toContain("123456");
  });

  it("accepts the Reporting API's content type", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://censefinance.com/home", effectiveDirective: "img-src", blockedURL: "https://x.example/a.png", disposition: "report" } }]);
    expect((await post(body, "application/reports+json; charset=utf-8")).status).toBe(204);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("refuses other content types and oversize bodies without logging", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post(report, "application/json")).status).toBe(415);
    expect((await post("x".repeat(9000), "application/csp-report")).status).toBe(413);
    expect((await post("not json", "application/csp-report")).status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});
