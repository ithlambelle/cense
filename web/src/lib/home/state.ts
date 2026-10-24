import type { Application } from "../api/application";
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
