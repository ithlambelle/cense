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
//   local tests cannot reach (they stand in for both). A browser only reports
//   a breach of these in its console, blocking nothing. Once a preview
//   deployment shows none on Safe to spend's connect step (real Plaid sandbox
//   Link) and with analytics on, set ENFORCE_FULL_POLICY to true.
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
//   (not installed). Vercel's toolbar on preview deployments is injected
//   without a nonce, so it does not load there; production has no toolbar.

// When true, the whole policy is enforced and no report-only header is sent.
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

export function contentSecurityPolicy(nonce: string, { dev = false } = {}): { enforced: string; reportOnly: string | null } {
  // Only scripts with this response's nonce run, and scripts those load
  // ('strict-dynamic': Next's page chunks, Plaid Link, PostHog's lazy
  // scripts). Browsers that know 'strict-dynamic' ignore 'self' and the Plaid
  // host; they are there for older ones. No 'unsafe-inline' and, outside
  // next dev (React's dev tools need it), no 'unsafe-eval'.
  const scriptSrc = [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'", PLAID_CDN, ...(dev ? ["'unsafe-eval'"] : [])];

  const enforced: Directives = {
    "script-src": scriptSrc,
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
    ...enforced,
  };

  return ENFORCE_FULL_POLICY ? { enforced: serialize(full), reportOnly: null } : { enforced: serialize(enforced), reportOnly: serialize(full) };
}
