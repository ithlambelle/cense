import type { z } from "zod";

import { quizAnswersSchema, type cardSchema } from "../api/schemas";
import { evaluateFit, type CardFit, type IncomeGateId } from "../rules/fit-tier";

type Card = z.infer<typeof cardSchema>;

export type ResultView =
  | { kind: "quiz_unfinished" }
  | { kind: "no_card"; ruleId: IncomeGateId | null; reason: string | null }
  | { kind: "match"; card: Card; fit: CardFit; alternative: Card | null };

// Works out what the result screen shows from the saved quiz answers and the
// catalog. The tier, reasons and pick all come from evaluateFit (rules v1.2);
// nothing here decides fit. "Another option" is the card the same rules pick
// once the top card is set aside.
export function computeResult(savedAnswers: unknown, cards: Card[]): ResultView {
  const parsed = quizAnswersSchema.safeParse(savedAnswers ?? {});
  if (!parsed.success) return { kind: "quiz_unfinished" };

  const result = evaluateFit(parsed.data, cards);
  if (result.status === "incomplete") return { kind: "quiz_unfinished" };
  if (result.recommendedCardId === null) {
    return {
      kind: "no_card",
      ruleId: result.noCardReason?.ruleId ?? null,
      reason: result.noCardReason?.reason ?? null,
    };
  }

  const topId = result.recommendedCardId;
  const card = cards.find((entry) => entry.id === topId);
  const fit = result.cards.find((entry) => entry.cardId === topId);
  if (!card || !fit) return { kind: "quiz_unfinished" };

  const rest = evaluateFit(parsed.data, cards.filter((entry) => entry.id !== topId));
  const alternativeId = rest.status === "complete" ? rest.recommendedCardId : null;
  const alternative = alternativeId ? (cards.find((entry) => entry.id === alternativeId) ?? null) : null;

  return { kind: "match", card, fit, alternative };
}
