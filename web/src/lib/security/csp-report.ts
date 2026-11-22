// Created with Claude Code (2026-11-17).
//
// Reads the reports browsers send when a page breaks its Content Security
// Policy (lib/security/csp.ts, report-uri), and turns them into
// one short log line. A report can carry full addresses with sign-in codes or
// ids in the query string, so only three things are kept: the rule that was
// broken, the origin of what was blocked (or a keyword such as "inline" or
// "eval"), and the page's path without its query string. Anyone can send a
// report, so the body is capped, oversize or malformed ones are dropped, and
// at most MAX_VIOLATIONS are logged per request.

export const MAX_REPORT_BYTES = 8 * 1024;
export const MAX_VIOLATIONS = 5;
const MAX_FIELD = 100;

// report-uri's format, and the Reporting API's in case report-to is added later.
export const REPORT_TYPES = new Set(["application/csp-report", "application/reports+json"]);

export type CspViolationLog = { directive: string; blocked: string; page: string; disposition: string };

// The body as text, or null when it is larger than the cap. Reads the stream
// itself and stops as soon as the cap is passed, so a large body is never
// held in memory.
export async function readCapped(request: Request, cap = MAX_REPORT_BYTES): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD) : "";
}

// An address's origin; a keyword ("inline", "eval", "self", "data", "blob")
// as it is; anything else as "other".
function blockedOrigin(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return "";
  if (/^[a-z-]+$/i.test(raw)) return raw.slice(0, MAX_FIELD);
  try {
    const url = new URL(raw);
    return url.origin === "null" ? `${url.protocol}` : url.origin;
  } catch {
    return "other";
  }
}

function pagePath(value: unknown): string {
  try {
    return new URL(typeof value === "string" ? value : "").pathname.slice(0, MAX_FIELD);
  } catch {
    return "";
  }
}

function fromLegacy(report: Record<string, unknown>): CspViolationLog {
  return {
    directive: text(report["effective-directive"] ?? report["violated-directive"]),
    blocked: blockedOrigin(report["blocked-uri"]),
    page: pagePath(report["document-uri"]),
    disposition: text(report.disposition),
  };
}

function fromReportingApi(body: Record<string, unknown>): CspViolationLog {
  return {
    directive: text(body.effectiveDirective),
    blocked: blockedOrigin(body.blockedURL),
    page: pagePath(body.documentURL),
    disposition: text(body.disposition),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// The violations in a report body, at most MAX_VIOLATIONS; empty when the body
// is not a report.
export function parseReport(contentType: string, body: string): CspViolationLog[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (contentType === "application/csp-report") {
    return isObject(data) && isObject(data["csp-report"]) ? [fromLegacy(data["csp-report"])] : [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry): entry is Record<string, unknown> => isObject(entry) && entry.type === "csp-violation" && isObject(entry.body))
    .slice(0, MAX_VIOLATIONS)
    .map((entry) => fromReportingApi(entry.body as Record<string, unknown>));
}
