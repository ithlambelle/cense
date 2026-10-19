import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Where the PostHog reverse proxy lives (rewrites in next.config.ts).
const ANALYTICS_PREFIX = "/rx/";

// The only request headers forwarded to PostHog. A rewrite forwards every
// header by default, which would send the Supabase session cookies (access and
// refresh tokens), any Authorization header and the full Referer, query string
// included. PostHog receives the body's type and encoding and the user agent.
// The visitor IP is never forwarded.
const ANALYTICS_HEADERS = ["accept", "accept-encoding", "content-encoding", "content-length", "content-type", "user-agent"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Analytics requests also skip the Supabase session refresh: they carry no
  // student session work, and refreshing there would add a round trip per event.
  if (pathname === "/rx" || pathname.startsWith(ANALYTICS_PREFIX)) {
    const headers = new Headers();
    for (const name of ANALYTICS_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return NextResponse.next({ request: { headers } });
  }
  // next.config.ts turns off Next's trailing-slash redirect for PostHog's
  // paths (/e/, /flags/), so it is done here for everything else: one address
  // per screen, for analytics and for search engines.
  if (pathname.length > 1 && pathname.endsWith("/")) {
    // A plain URL: NextURL keeps a trailing slash it was created with.
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, "") || "/";
    return NextResponse.redirect(url, 308);
  }
  return updateSession(request);
}

export const config = {
  // Every page and API route, but not static files and images. /rx is listed
  // first so a PostHog path ending in .png or .svg still has its headers cut.
  matcher: ["/rx", "/rx/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)"],
};
