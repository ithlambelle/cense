import type { Application, ApplicationDetail } from "../api/application";
import type { ReminderSettings } from "../api/reminders";
import type { ResultView } from "../results/compute";

export type HomeState =
  // No complete quiz and nothing tracked. `started` is true when some answers are saved.
  | { kind: "no_quiz"; started: boolean }
  // A complete quiz with a match, and nothing tracked yet.
  | { kind: "matched"; result: Extract<ResultView, { kind: "match" }> }
  // A complete quiz where no listed card fits, and nothing tracked yet.
  | { kind: "no_card"; reason: string | null }
  // At least one tracked card. `primary` sets the next step; `others` are listed below.
  | { kind: "tracking"; primary: Application; others: Application[] };

// The leading card's own fields Home reads beyond the list: the denial reason
// and note for a denied card, autopay and the saved due day for an approved one.
export type CardDetail = Pick<ApplicationDetail, "denialReason" | "denialReasonNote" | "autopayStatus" | "paymentDueDay">;

// The two reminder settings the reminder star depends on.
export type StarSettings = Pick<ReminderSettings, "paymentDue" | "emailsOn">;
export const ALL_REMINDERS_ON: StarSettings = { paymentDue: true, emailsOn: true };

// Whether a card's payment reminder is really on: its due day is saved, the
// due-date email is on and reminder emails are not off. The reminder star on
// Home and on the plan needs this as well as its saved step. The settings
// cover every card, so turning the due-date email off from another card, or
// in Reminder settings, puts this card's star out too (Reminders audit R-08);
// turning it back on lights it again, as the step is still saved.
export function paymentReminderOn(detail: Pick<ApplicationDetail, "paymentDueDay"> | null, settings: StarSettings): boolean {
  return detail?.paymentDueDay != null && settings.paymentDue && settings.emailsOn;
}

// What an approved card's page says about its payment reminders: not set
// until its days are saved, then on while any of its two emails is on.
export type ReminderStatus = "on" | "off" | "not_set";

export function reminderStatus(
  detail: Pick<ApplicationDetail, "statementClosingDay" | "paymentDueDay">,
  settings: Pick<ReminderSettings, "emailsOn" | "statementClosing" | "paymentDue">,
): ReminderStatus {
  if (detail.statementClosingDay === null || detail.paymentDueDay === null) return "not_set";
  return settings.emailsOn && (settings.paymentDue || settings.statementClosing) ? "on" : "off";
}

// Only an approved or denied leading card needs them.
export function needsDetail(state: HomeState): state is Extract<HomeState, { kind: "tracking" }> {
  return state.kind === "tracking" && state.primary.status !== "applied";
}

// What Home shows (plan default P-2, 2026-10-16). Tracked cards always win
// over the quiz: once a student has applied or added a card, that is their
// next step. Among tracked cards the most recently changed one leads, so the
// newest decision is what Home talks about. Ties keep the API's order.
export function homeState(applications: Application[], quiz: ResultView, quizStarted: boolean): HomeState {
  if (applications.length > 0) {
    const sorted = [...applications].sort(
      (a, b) => Date.parse(b.statusUpdatedAt) - Date.parse(a.statusUpdatedAt),
    );
    const [primary, ...others] = sorted;
    return { kind: "tracking", primary, others };
  }
  if (quiz.kind === "match") return { kind: "matched", result: quiz };
  if (quiz.kind === "no_card") return { kind: "no_card", reason: quiz.reason };
  return { kind: "no_quiz", started: quizStarted };
}

// Which approved card the first-month plan is for: the one asked for (from
// Home's "Your other cards"), or else the most recently changed approved card.
// A card that is not approved, or not this student's, is never shown.
export function planApplication(applications: Application[], requestedId: string | null): Application | null {
  const approved = applications
    .filter((application) => application.status === "approved")
    .sort((a, b) => Date.parse(b.statusUpdatedAt) - Date.parse(a.statusUpdatedAt));
  return approved.find((application) => application.id === requestedId) ?? approved[0] ?? null;
}

// The tracked card a card's page shows the status of: the most recently
// changed one for that card still open to update (applied or approved), or
// else the most recent. Null when the student does not track that card.
export function cardApplication(applications: Application[], cardId: string): Application | null {
  const forCard = applications
    .filter((application) => application.cardId === cardId)
    .sort((a, b) => Date.parse(b.statusUpdatedAt) - Date.parse(a.statusUpdatedAt));
  return forCard.find((application) => application.status !== "rejected") ?? forCard[0] ?? null;
}

// Home celebrates a card once, on the arrival from Mark result that just
// approved it (?celebrate=<id>). Any other id, or a card that is not the one
// Home leads with, is ignored.
export function celebrating(state: HomeState, celebrateId: string | null): boolean {
  return state.kind === "tracking" && state.primary.status === "approved" && state.primary.id === celebrateId;
}

// The letter in the profile circle. There is no saved name yet (display_name
// arrives with #41), so it is the first letter of the email for now.
export function profileInitial(email: string | null): string {
  return email?.trim().charAt(0).toUpperCase() ?? "";
}
