import type { NextConfig } from "next";

// Baseline headers for every response. frame-ancestors and X-Frame-Options
// stop other sites from framing the app to trick a tap on a button; nosniff
// stops browsers guessing file types; the referrer policy keeps full URLs
// from leaking to issuer sites; HSTS keeps students on https once they visit.
// Pages get the Content-Security-Policy, with a fresh nonce per response,
// from src/proxy.ts (lib/security/csp.ts), which carries frame-ancestors
// 'none'. It is not repeated here: two CSP headers would both apply.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// The complement of the proxy's matcher (src/proxy.ts, config.matcher).
const PROXY_SKIPPED = [
  "/_next/static/:path*",
  "/_next/image",
  "/favicon.ico",
  "/:path*.(svg|png|jpg|jpeg|gif|webp|avif|ico)",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // AVIF first where the browser supports it; it is smaller than WebP for the mascot images.
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The paths src/proxy.ts skips (images, icons, /_next/static) never
      // get its policy. A missing image there is answered with the HTML
      // not-found page, so it still gets frame-ancestors.
      ...PROXY_SKIPPED.map((source) => ({ source, headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] })),
    ];
  },
  // PostHog through this app's own origin (src/instrumentation-client.ts sets
  // api_host "/rx"), so ad blockers keep the funnel intact. Static assets
  // first, then everything else to the ingestion host. The path is not
  // "posthog" or "analytics" on purpose, as blockers match those. A rewrite
  // forwards every request header, so src/proxy.ts passes on only an allowlist.
  // The CSP (lib/security/csp.ts) allows these as same-origin requests, and
  // PostHog's lazily loaded replay and error scripts through 'strict-dynamic'.
  // https://posthog.com/docs/advanced/proxy/nextjs
  async rewrites() {
    return [
      { source: "/rx/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/rx/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/rx/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  // PostHog's API paths end in a slash (/e/, /flags/); without this Next
  // redirects them and the browser drops the request body.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
