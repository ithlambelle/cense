import type { NextConfig } from "next";

// Baseline headers for every response. frame-ancestors and X-Frame-Options
// stop other sites from framing the app to trick a tap on a button; nosniff
// stops browsers guessing file types; the referrer policy keeps full URLs
// from leaking to issuer sites; HSTS keeps students on https once they visit.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // AVIF first where the browser supports it; it is smaller than WebP for the mascot images.
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
