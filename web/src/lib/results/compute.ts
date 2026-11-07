import { quizAnswersSchema } from "../api/schemas";
import type { Card } from "../cards/catalog";
import { cardRewards, type CardRewards } from "../cards/rewards";
import type { QuizAnswers } from "../quiz/questions";
import { evaluateFit, type CardFit, type FitResult, type IncomeGateId } from "../rules/fit-tier";
import { estimateYearOne, spendingProfile, type YearOneEstimate } from "./value";

// How many cards the result shows and how varied they are (Ben, 2026-11-07,
// after interviews: Taral wanted three cards, Ella more than one bank).
export const RESULT_OPTIONS = {
  // Cards on the result, top match first.
  max: 3,
  // At most this many from one issuer.
  perIssuer: 2,
} as const;

// The issuer as students see it: the brand on the card. Discover cards are now
// issued by Capital One, N.A., but students know them as Discover.
function issuerOf(card: Card): string {
  return card.brand;
}

// Where a card's rewards come from. Tests pass their own.
export type RewardsLookup = (cardId: string) => CardRewards | null;

export type ResultOption = {
  card: Card;
  // The card's own tier and reasons from the rules, so a stretch never reads
  // as an equal pick.
  fit: CardFit;
  rewards: CardRewards | null;
  // Null when the student gave no monthly spend or the card has no rewards data.
  estimate: YearOneEstimate | null;
};

export type ResultView =
  | { kind: "quiz_unfinished" }
  | { kind: "no_card"; ruleId: IncomeGateId | null; reason: string | null }
  // Up to RESULT_OPTIONS.max cards, best first. The first is the rules' pick.
  | { kind: "match"; options: [ResultOption, ...ResultOption[]] };

export type RankedFit = {
  result: FitResult;
  estimates: ReadonlyMap<string, YearOneEstimate | null>;
};

// The rules' result with each card's year-one estimate, ranked by fit rules
// v1.3. The one place both the result screen and the saved record get their
// order, so what is saved is what was shown.
export function rankedFit(answers: QuizAnswers, cards: Card[], rewardsFor: RewardsLookup = cardRewards): RankedFit {
  const profile = spendingProfile(answers);
  const estimates = new Map(cards.map((card) => [card.id, estimateYearOne(rewardsFor(card.id), profile)] as const));
  // Value ranks only when the student answered spending; no data counts as 0.
  const values = profile
    ? Object.fromEntries(cards.map((card) => [card.id, estimates.get(card.id)?.rankingCents ?? 0]))
    : null;
  return { result: evaluateFit(answers, cards, values), estimates };
}

// Works out what the result screen shows from the saved quiz answers and the
// catalog. Tiers, reasons and order come from evaluateFit; nothing here decides
// fit. The ranking lists likely fits before stretches, so a stretch is shown
// only when fewer than three likely fits are left after the issuer limit.
export function computeResult(savedAnswers: unknown, cards: Card[], rewardsFor: RewardsLookup = cardRewards): ResultView {
  const parsed = quizAnswersSchema.safeParse(savedAnswers ?? {});
  if (!parsed.success) return { kind: "quiz_unfinished" };

  const { result, estimates } = rankedFit(parsed.data, cards, rewardsFor);
  if (result.status === "incomplete") return { kind: "quiz_unfinished" };

  const options: ResultOption[] = [];
  const fromIssuer = new Map<string, number>();
  for (const id of result.ranking) {
    if (options.length >= RESULT_OPTIONS.max) break;
    const card = cards.find((entry) => entry.id === id);
    const fit = result.cards.find((entry) => entry.cardId === id);
    if (!card || !fit) continue;
    const issuer = issuerOf(card);
    const count = fromIssuer.get(issuer) ?? 0;
    if (count >= RESULT_OPTIONS.perIssuer) continue;
    fromIssuer.set(issuer, count + 1);
    options.push({ card, fit, rewards: rewardsFor(id), estimate: estimates.get(id) ?? null });
  }

  const [top, ...rest] = options;
  if (!top) {
    return {
      kind: "no_card",
      ruleId: result.noCardReason?.ruleId ?? null,
      reason: result.noCardReason?.reason ?? null,
    };
  }
  return { kind: "match", options: [top, ...rest] };
}
