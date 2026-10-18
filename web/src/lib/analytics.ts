import posthog from "posthog-js";

// Add to an element's className when its text says something about the
// student: their answers, a card's status, a credit limit. It does two things:
// - `ph-sensitive` is read by PostHog autocapture, which then keeps the click
//   but drops the element's text and that of everything inside it.
// - session replay masks the same elements' text (maskTextSelector in
//   instrumentation-client.ts), so recordings show asterisks instead.
export const SENSITIVE = "ph-sensitive";
export const SENSITIVE_SELECTOR = `.${SENSITIVE}`;

export type FitTierProp = "likely_fit" | "stretch" | "not_yet" | "none";

// Every funnel event and the only properties each may carry. Nothing personal:
// no email, password, codes, income band, recent denial or credit limit. Card
// ids are catalog ids, the same for every student.
export type AnalyticsEvents = {
  quiz_started: undefined;
  quiz_completed: { retake: boolean };
  result_viewed: { tier: FitTierProp; has_alternative: boolean };
  issuer_clicked: { kind: "preapproval" | "apply"; card_id: string };
  did_finish_applying: { answer: "yes" | "not_yet" };
  application_status_marked: { status: "approved" | "rejected" | "waiting" };
  denial_letter_choice: { choice: "looks_right" | "no_letter" | "looks_wrong" };
  denial_plan_viewed: undefined;
  card_added_manually: undefined;
};

export type AnalyticsEvent = keyof AnalyticsEvents;

// The props argument, required exactly when the event has properties.
type PropsArg<E extends AnalyticsEvent> = AnalyticsEvents[E] extends undefined ? [] : [props: AnalyticsEvents[E]];

// For components that take an event as props: `props` only when it has any.
export type EventProps<E extends AnalyticsEvent> = { event: E } & (AnalyticsEvents[E] extends undefined
  ? { props?: undefined }
  : { props: AnalyticsEvents[E] });

// No-op until PostHog has loaded, which only happens when the token is set.
// Never throws: a failed capture must not interrupt the student.
export function track<E extends AnalyticsEvent>(event: E, ...rest: PropsArg<E>): void {
  capture(event, rest[0]);
}

// Untyped core of track, for the EventProps components below.
export function capture(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  try {
    if (!posthog.__loaded) return;
    posthog.capture(event, props);
  } catch {
    // Ignored on purpose.
  }
}

// The signed-in student, by Supabase user id only.
export function identify(studentId: string): void {
  try {
    if (!posthog.__loaded) return;
    if (posthog.get_distinct_id() === studentId) return;
    posthog.identify(studentId);
  } catch {
    // Ignored on purpose.
  }
}

// On log out, so the next person on this browser is not linked to the student.
export function resetAnalytics(): void {
  try {
    if (!posthog.__loaded) return;
    posthog.reset();
  } catch {
    // Ignored on purpose.
  }
}
