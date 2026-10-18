import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Where the PostHog reverse proxy lives (rewrites in next.config.ts).
const ANALYTICS_PREFIX = "/rx/";

export async function proxy(request: NextRequest) {
  // Analytics requests skip the Supabase session refresh: they carry no
  // student session work, and refreshing there would add a round trip per
  // event. The rewrite forwards every request header to PostHog, so the
  // cookies are dropped here first. Without this the Supabase session cookies
  // (access and refresh tokens) would reach a third party.
  if (request.nextUrl.pathname.startsWith(ANALYTICS_PREFIX)) {
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    return NextResponse.next({ request: { headers } });
  }
  return updateSession(request);
}

export const config = {
  // Every page and API route, but not static files and images. /rx stays in:
  // see the analytics branch above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)"],
};
