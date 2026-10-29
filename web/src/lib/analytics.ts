import posthog from "posthog-js";

import { EVENTS, type AnalyticsEvent, type EventProperties, type HasNoProperties } from "@/lib/analytics-catalog";
import { analyticsEnvironment, baseProperties } from "@/lib/analytics-config";

// The only door to PostHog (a lint rule bans importing posthog-js elsewhere).
// Every event is checked against the catalog in analytics-catalog.ts.
//
// Add SENSITIVE to an element's className when its text says something about
// the student: their answers, a card's status, a credit limit. Autocapture then
// keeps the click but drops the text, and session replay shows asterisks.
export { NO_CAPTURE, SENSITIVE, SENSITIVE_SELECTOR } from "@/lib/analytics-config";
export type { AnalyticsEvent, EventProperties } from "@/lib/analytics-catalog";

// For an event copied from a Postgres row (S46): the row id as the event id
// and the row's database time as the event time.
export type TrackOptions = { uuid?: string; timestamp?: Date };

// Events with no properties can leave them out.
type TrackArgs<E extends AnalyticsEvent> = HasNoProperties<E> extends true
  ? [props?: EventProperties<E>, options?: TrackOptions]
  : [props: EventProperties<E>, options?: TrackOptions];

// For components that take an event as props: `props` only when it has any.
export type EventProps<E extends AnalyticsEvent> = { event: E } & (HasNoProperties<E> extends true
  ? { props?: EventProperties<E> }
  : { props: EventProperties<E> });

// A bad event is a bug: it throws in development and tests, so the test that
// sends it fails. In a deployed build it is dropped and reported instead,
// because analytics must never interrupt a student.
export function track<E extends AnalyticsEvent>(event: E, ...[props, options]: TrackArgs<E>): void {
  const parsed = EVENTS[event].properties.safeParse(props ?? {});
  if (!parsed.success) {
    const message = `analytics: "${event}" does not match the catalog: ${parsed.error.message}`;
    if (process.env.NODE_ENV !== "production") throw new Error(message);
    report("analytics_event_invalid", event);
    return;
  }
  // S48: locally and on previews the event is printed, so it can be checked.
  if (process.env.NODE_ENV === "development" || analyticsEnvironment() === "preview") {
    console.info("[analytics]", event, parsed.data);
  }
  try {
    // Not loaded when the project token is not set (local runs, tests, CI).
    if (!posthog.__loaded) return;
    posthog.capture(event, parsed.data, options);
  } catch {
    report("analytics_capture_failed", event);
  }
}

// The signed-in student, by Supabase user id only (S36), on every signed-in
// page load in every context (S48). A different student on the same browser
// starts from a reset, because PostHog cannot move an identified browser to a
// new id.
export function identify(studentId: string, isInternal: boolean): void {
  try {
    if (!posthog.__loaded) return;
    if (posthog.get_distinct_id() !== studentId) {
      if (posthog._isIdentified()) resetAnalytics();
      posthog.identify(studentId);
    }
    posthog.register({ is_internal: isInternal });
  } catch {
    report("analytics_identify_failed", null);
  }
}

// On log out, so the next person on this browser is not linked to the student.
// reset() also clears the properties sent with every event, so they are set again.
export function resetAnalytics(): void {
  try {
    if (!posthog.__loaded) return;
    posthog.reset();
    posthog.register(baseProperties());
  } catch {
    report("analytics_reset_failed", null);
  }
}

// Structured, and never the event's properties.
function report(problem: string, event: AnalyticsEvent | null): void {
  console.warn(JSON.stringify({ event: problem, analyticsEvent: event }));
}
