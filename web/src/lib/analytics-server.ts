import "server-only";

import { EVENTS, sentFrom, TRACKING_PLAN_VERSION, type AnalyticsEvent, type EventProperties } from "@/lib/analytics-catalog";
import { analyticsEnvironment } from "@/lib/analytics-config";
import { isInternalStudent } from "@/lib/internal-students";
import type { ServiceClient } from "@/lib/supabase/service";

// Events the server sends (S48: key events are recorded by the server, where
// ad blockers cannot hide them), for moments with no browser open: the daily
// reminder job and an email's unsubscribe link. The same catalog as track(),
// the same project token and region as the browser (next.config.ts forwards
// /rx to the US region), and PostHog's documented batch endpoint. Off unless
// NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is set, so local runs, tests and CI send
// nothing.
//
// The student is their Supabase user id only (S36), as identify() sends it.
// Never an email, a name, a card or a key in an event, and none in a log.

export const POSTHOG_BATCH_URL = "https://us.i.posthog.com/batch/";
// Short: the reminder job sends these at the end of its run (job.ts budget).
const TIMEOUT_MS = 2_000;

export type ServerEvent<E extends AnalyticsEvent = AnalyticsEvent> = {
  event: E;
  studentId: string;
  properties: EventProperties<E>;
  // For an event copied from a Postgres row (S46): the row id, so a retry
  // never counts twice.
  uuid?: string;
  timestamp?: Date;
};

type Options = { token?: string; fetch?: typeof fetch };

function report(problem: string, fields: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ event: problem, ...fields }));
}

// The Analytics switch (profiles.analytics_opted_out_at) covers the server's
// events too: keeps only the events for students whose switch is on, read in
// one query with the service client the caller already holds. Fails closed:
// if the read fails, or a student has no profile row, their events are
// dropped. Never throws, so it can never stop the email or the unsubscribe.
export async function withAnalyticsOn<E extends AnalyticsEvent>(
  supabase: Pick<ServiceClient, "from">,
  events: ServerEvent<E>[],
): Promise<ServerEvent<E>[]> {
  if (events.length === 0) return [];
  const studentIds = [...new Set(events.map((event) => event.studentId))];
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("student_id, analytics_opted_out_at")
      .in("student_id", studentIds);
    if (error) {
      report("analytics_consent_read_failed", { code: error.code ?? null, count: events.length });
      return [];
    }
    const rows = (data ?? []) as { student_id: string; analytics_opted_out_at: string | null }[];
    const on = new Set(rows.filter((row) => row.analytics_opted_out_at === null).map((row) => row.student_id));
    return events.filter((event) => on.has(event.studentId));
  } catch (error) {
    report("analytics_consent_read_failed", { code: error instanceof Error ? error.name : "read_failed", count: events.length });
    return [];
  }
}

// Sends the events in one request. Callers pass them through withAnalyticsOn
// first. Never throws in a deployed build: a
// failure is logged and the caller carries on (analytics must never stop a
// reminder). An event the catalog does not allow from the server is a bug: it
// throws in development and tests, and is dropped and reported when deployed.
export async function captureServer(
  events: ServerEvent[],
  { token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, fetch: fetchImpl = fetch }: Options = {},
): Promise<void> {
  const batch = [];
  for (const { event, studentId, properties, uuid, timestamp } of events) {
    const parsed = EVENTS[event].properties.safeParse(properties);
    if (!parsed.success || !sentFrom(event).server) {
      const message = `analytics: "${event}" cannot be sent by the server with these properties`;
      if (process.env.NODE_ENV !== "production") throw new Error(message);
      report("analytics_event_invalid", { analyticsEvent: event });
      continue;
    }
    batch.push({
      event,
      ...(uuid ? { uuid } : {}),
      timestamp: (timestamp ?? new Date()).toISOString(),
      properties: {
        ...parsed.data,
        distinct_id: studentId,
        // The properties every browser event carries (analytics-config.ts).
        plan_version: TRACKING_PLAN_VERSION,
        platform: "server",
        app_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
        environment: analyticsEnvironment(process.env.VERCEL_ENV),
        is_internal: isInternalStudent(studentId),
        $geoip_disable: true,
        $lib: "cense-server",
      },
    });
  }
  if (!token || batch.length === 0) return;

  try {
    const response = await fetchImpl(POSTHOG_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: token, batch }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) report("analytics_server_failed", { status: response.status, count: batch.length });
  } catch (error) {
    report("analytics_server_failed", { status: null, code: error instanceof Error ? error.name : "fetch_failed", count: batch.length });
  }
}
