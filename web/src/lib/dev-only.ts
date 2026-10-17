// Pages for design review are shown locally and on Vercel preview links, never in production.
export function devPagesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}

// Local development only. For dev pages whose screens can write real data for
// the visitor when a session exists (Vercel previews use real sign-in cookies).
export function localDevOnly(): boolean {
  return process.env.NODE_ENV !== "production";
}
