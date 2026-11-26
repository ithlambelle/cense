import { quizAnswersSchema } from "../api/schemas";
import type { Card } from "../cards/catalog";
import { catalogCardNamed } from "../cards/match";
import { cardRewards, type CardRewards } from "../cards/rewards";
import { cardDisplayName, OWNS_EVERY_FIT } from "../copy/results";
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
  // ownsEveryFit: cards fit, and the student already has every one of them.
  | { kind: "no_card"; ruleId: IncomeGateId | null; reason: string | null; ownsEveryFit?: true }
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

// The catalog without the cards the student already has, so no result offers
// a card they own: an approved card with that catalog id (Mark result, or Add
// a card from the list), or an approved card added by a name that is exactly
// a catalog card's (typed before Add a card offered the list). Applied and
// denied cards stay: the result screen shows those as tracked instead.
export function cardsToOffer(
  cards: Card[],
  applications: { cardId: string | null; cardName: string; status: string }[],
): Card[] {
  const named = cards.map((card) => ({ id: card.id, name: cardDisplayName(card) }));
  const owned = new Set(
    applications.flatMap((application) => {
      if (application.status !== "approved") return [];
      const id = application.cardId ?? catalogCardNamed(named, application.cardName)?.id;
      return id ? [id] : [];
    }),
  );
  return owned.size === 0 ? cards : cards.filter((card) => !owned.has(card.id));
}

// The result for a signed-in student: computeResult over cardsToOffer's list.
// When nothing is left only because they already have every card that fits,
// it says so instead of "none of our cards fits you".
export function computeOfferedResult(
  savedAnswers: unknown,
  catalog: Card[],
  applications: { cardId: string | null; cardName: string; status: string }[],
  rewardsFor: RewardsLookup = cardRewards,
): ResultView {
  const offered = cardsToOffer(catalog, applications);
  const view = computeResult(savedAnswers, offered, rewardsFor);
  if (view.kind !== "no_card" || offered.length === catalog.length) return view;
  return computeResult(savedAnswers, catalog, rewardsFor).kind === "match"
    ? { kind: "no_card", ruleId: null, reason: OWNS_EVERY_FIT.body, ownsEveryFit: true }
    : view;
}

// Works out what the result screen shows from the saved quiz answers and the
// catalog (cardsToOffer's list for a signed-in student). Tiers, reasons and order come from evaluateFit; nothing here decides
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
