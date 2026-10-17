import type { z } from "zod";

import type { applicationSchema } from "../api/schemas";
import type { ResultView } from "../results/compute";

export type Application = z.infer<typeof applicationSchema>;

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
