// Created with Claude Code (2026-11-17).
//
// The address that links in sign-in and reset emails point at. Built from
// APP_BASE_URL (the same setting as the links in reminder emails), never from
// the request: the request's own address comes from its Host header, and an
// emailed link must not be steerable by whoever asked for the email (external
// audit of a8fe7d4). Supabase also drops a return address that is not on its
// redirect allow-list, so the allow-list is the second guard.
//
// Without APP_BASE_URL: null on the production deployment, so the caller
// refuses or leaves the return address to Supabase's own Site URL. Anywhere
// else (local runs, the journey tests, Vercel previews, which each have their
// own address) the request's origin.
export function emailLinkOrigin(requestUrl: string, env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Not an address: treated as unset.
    }
  }
  if (env.VERCEL_ENV === "production") return null;
  return new URL(requestUrl).origin;
}

// Logged when production has no usable APP_BASE_URL (the name only).
export function logMissingAppBaseUrl(route: string): void {
  console.error(JSON.stringify({ event: "auth_email_links_not_configured", route, missing: ["APP_BASE_URL"] }));
}
