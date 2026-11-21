// Created with Claude Code (2026-11-17).
//
// Where browsers send Content Security Policy reports (lib/security/csp.ts).
// No sign-in, database or analytics: each request becomes at most one log
// line with the broken rule, the blocked origin and the page's path
// (lib/security/csp-report.ts). Always answers 204, or 413 or 415, with no body.
import { MAX_REPORT_BYTES, parseReport, readCapped, REPORT_TYPES } from "@/lib/security/csp-report";

export async function POST(request: Request): Promise<Response> {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!REPORT_TYPES.has(type)) return new Response(null, { status: 415 });
  const body = await readCapped(request, MAX_REPORT_BYTES);
  if (body === null) return new Response(null, { status: 413 });
  const violations = parseReport(type, body);
  if (violations.length > 0) console.warn(JSON.stringify({ event: "csp_violation", violations }));
  return new Response(null, { status: 204 });
}
