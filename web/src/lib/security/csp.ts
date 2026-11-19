// Created with Claude Code (2026-11-17).
//
// The Content Security Policy for every page, built per request in
// src/proxy.ts with a fresh nonce. Next.js reads the nonce from the request's
// Content-Security-Policy header and puts it on its own scripts, so only
// scripts the app itself sends run; a script an attacker manages to inject
// into a page has no nonce and is refused.
// https://nextjs.org/docs/app/guides/content-security-policy
//
// Two headers:
// - Content-Security-Policy (enforced): the part that stops injected scripts
//   (script-src), plus plugins, <base>, form targets and framing. None of it
//   depends on what a third party's code does at run time, and the journey
//   tests walk every flow with it on.
// - Content-Security-Policy-Report-Only: the whole policy, including the
//   allowlists for requests, frames, images, fonts and styles. These depend on
//   what Plaid Link's and PostHog's own code loads in production, which the
//   local tests cannot reach (they stand in for both). A breach of these is
//   reported, never blocked.
//
// On Vercel preview deployments (VERCEL_ENV=preview) script-src is
// report-only too, so Vercel's toolbar, which Vercel injects without a nonce,
// still loads there; production and local runs (and so the journey tests)
// enforce it. Reports from previews about vercel.live or vercel.com are the
// toolbar and can be ignored.
//
// Reports go to /api/v1/csp-report by report-uri, which every browser sends
// at once. report-to is left out on purpose: with it, Chrome ignores report-uri,
// and in testing headless Chrome delivered no report-to report at all, while
// report-uri reports arrived within seconds. The route logs the broken rule,
// the blocked origin and the page's path as one "csp_violation" line.
//
// Checking a preview: curl -sI <preview URL>/sign-in shows
// content-security-policy-report-only with script-src and a nonce, and
// content-security-policy without script-src. In the browser console, walk
// Safe to spend's connect step (real Plaid sandbox Link) and a few screens
// with analytics on: any "[Report Only] Refused to ..." line other than
// vercel.live is a gap, and shows in the logs as csp_violation. With none,
// set ENFORCE_FULL_POLICY to true.
//
// Every origin the browser uses, and why:
// - The app itself ('self'): pages, API routes, /_next assets, fonts (next/font
//   serves Google fonts from the app at build time, so no Google host), and
//   PostHog, which is reached only through the app's /rx reverse proxy
//   (next.config.ts), including the replay and error scripts it loads later.
// - Plaid Link: its script from cdn.plaid.com, the Link frame from
//   cdn.plaid.com, and calls to Plaid's API host, as Plaid documents
//   (https://plaid.com/docs/link/web/, "Content Security Policy"). Sandbox
//   now; production is listed so turning it on later does not break Link.
// - Not listed: Supabase (the browser never calls it; the app's server does,
//   see lib/supabase/config.ts), Google sign-in (a full-page navigation to
//   accounts.google.com, which CSP does not restrict), and Vercel Analytics
//   (not installed). Vercel's toolbar (previews only) is covered above.
//
// API routes get no policy from the proxy: they answer JSON, and the one that
// answers HTML (the unsubscribe page) sets its own, stricter one. Files the
// proxy skips (images, /_next/static) get frame-ancestors from next.config.ts.

// When true, the whole policy is enforced (outside previews) and no
// report-only header is sent.
export const ENFORCE_FULL_POLICY = false;

const PLAID_CDN = "https://cdn.plaid.com";
const PLAID_API = ["https://sandbox.plaid.com", "https://production.plaid.com"];

type Directives = Record<string, string[]>;

function serialize(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

// A fresh, unguessable nonce for one response: 16 random bytes, base64.
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

// Where browsers send reports (app/api/v1/csp-report/route.ts).
export const CSP_REPORT_PATH = "/api/v1/csp-report";

export type CspHeaders = {
  // For the request, so Next.js finds the nonce: always holds script-src.
  request: string;
  enforced: string;
  reportOnly: string | null;
};

export function contentSecurityPolicy(nonce: string, { dev = false, preview = false } = {}): CspHeaders {
  // Only scripts with this response's nonce run, and scripts those load
  // ('strict-dynamic': Next's page chunks, Plaid Link, PostHog's lazy
  // scripts). Browsers that know 'strict-dynamic' ignore 'self' and the Plaid
  // host; they are there for older ones. No 'unsafe-inline' and, outside
  // next dev (React's dev tools need it), no 'unsafe-eval'.
  const scriptSrc = [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'", PLAID_CDN, ...(dev ? ["'unsafe-eval'"] : [])];
  const reporting: Directives = { "report-uri": [CSP_REPORT_PATH] };

  const always: Directives = {
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Every form submits to the app (they are all handled in the page, with
    // method="post" as the fallback). Google sign-in is a link, not a form.
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const full: Directives = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    // 'unsafe-inline' for styles, not a nonce: React writes style props as
    // style attributes in the server-rendered HTML, which a nonce cannot
    // cover, and Plaid Link adds inline styles to the page. A style cannot run
    // code; the protection that matters is script-src.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    // 'self' also covers next dev's hot-reload websocket on the same host.
    "connect-src": ["'self'", ...PLAID_API],
    "frame-src": [PLAID_CDN],
    // Workers would otherwise fall back to script-src, where 'strict-dynamic'
    // drops 'self'.
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    ...always,
    ...reporting,
  };

  const request = serialize(full);
  if (preview) return { request, enforced: serialize({ ...always, ...reporting }), reportOnly: request };
  if (ENFORCE_FULL_POLICY) return { request, enforced: request, reportOnly: null };
  return { request, enforced: serialize({ "script-src": scriptSrc, ...always, ...reporting }), reportOnly: request };
}
