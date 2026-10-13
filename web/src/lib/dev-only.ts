// Pages for design review are shown locally and on Vercel preview links, never in production.
export function devPagesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}
