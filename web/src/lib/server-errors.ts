import "server-only";

import { PostHog } from "posthog-node";

import { analyticsEnvironment } from "@/lib/analytics-config";

// Errors the server did not handle, to PostHog error tracking: the same
// project as the browser's events (S21), whose alerts post to the team (S51).
// Off unless NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is set, which is only on Vercel
// Production, so local runs, tests and CI send nothing.
//
// Never student data: a route's file path (/api/v1/applications/[id]), never
// its address, and no student id, so the event has no person in PostHog.
const INGEST_HOST = "https://us.i.posthog.com";

type ErrorClient = Pick<PostHog, "captureExceptionImmediate">;

let client: ErrorClient | null | undefined;

function errorClient(): ErrorClient | null {
  if (client === undefined) {
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    // Each report is sent at once, before a serverless function is frozen.
    client = token ? new PostHog(token, { host: INGEST_HOST, flushAt: 1, flushInterval: 0, disableGeoip: true }) : null;
  }
  return client;
}

export function serverErrorTrackingOn(): boolean {
  return errorClient() !== null;
}

// Pass where it happened (route, method), never request data.
export async function reportServerError(
  error: unknown,
  where: Record<string, string | undefined>,
  posthog: ErrorClient | null = errorClient(),
): Promise<void> {
  if (!posthog) return;
  try {
    await posthog.captureExceptionImmediate(error, undefined, {
      ...where,
      environment: analyticsEnvironment(),
      app_version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      $geoip_disable: true,
    });
  } catch {
    // Reporting must never turn one error into two; the failure is still logged.
    console.warn(JSON.stringify({ event: "error_report_failed" }));
  }
}
