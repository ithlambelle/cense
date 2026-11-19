// Created with Claude Code (2026-11-17).
//
// Records every Content Security Policy breach in a browser context, enforced
// or report-only (src/lib/security/csp.ts), so a test can expect none. Each
// page reports breaches to the test through a binding, and the console is
// read too, for anything the page's listener cannot see.
import type { BrowserContext } from "@playwright/test";

export type CspViolation = {
  page: string;
  directive: string;
  blocked: string;
  disposition: string;
  sample: string;
  source: string;
};

export async function watchCsp(context: BrowserContext): Promise<CspViolation[]> {
  const violations: CspViolation[] = [];
  await context.exposeBinding("__reportCspViolation", (_source, violation: CspViolation) => {
    violations.push(violation);
  });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __reportCspViolation: (v: unknown) => void }).__reportCspViolation({
        page: location.pathname,
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        disposition: event.disposition,
        sample: event.sample,
        source: `${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      });
    });
  });
  context.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) {
      violations.push({ page: message.page()?.url() ?? "", directive: "console", blocked: "", disposition: message.type(), sample: message.text(), source: "" });
    }
  });
  return violations;
}
