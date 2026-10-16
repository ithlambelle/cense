import type { z } from "zod";

import type { cardSchema, quizAnswersSchema, recommendationSchema } from "../api/schemas";

// Fit Tier Rules. Every rule ID, reason and note below is quoted from the
// team's Notion page "Fit Tier Rules v1.2 (Credit Card Recommender)". Change
// this file only when the rules change, and bump RULES_VERSION with it.
//
// v1.2 keeps the v1.1 gates, cautions and tiers. It changes four things:
// - Only cards with catalogRole "recommend" are tiered. Explore cards are for browsing.
// - A card whose history level is an estimate is tiered, and ranks below one
//   whose level the issuer publishes.
// - Reason text: G6 is built from the card's deposit, C1 mentions preapproval
//   only when the card has a preapproval link, C3 does not point a secured
//   card to a secured card, and C2 suggests a secured card.
// - The pick order (section 6): a recent denial favours secured or rebuilding
//   cards, published history before estimated, less history needed first, and
//   the build_credit goal favours a stated upgrade path. First-year value is
//   planned, not built.
// It also removes note N3 (tax ID), counts "not sure" as no history, and
// always asks Q6.
export const RULES_VERSION = "fit-rules v1.2";

type Card = z.infer<typeof cardSchema>;
type QuizAnswers = z.infer<typeof quizAnswersSchema>;

export type FitTier = z.infer<typeof recommendationSchema>["fitTier"];

// The smallest slice of a card the rules read. A full catalog card fits it.
export type RuleCard = Pick<
  Card,
  | "id"
  | "catalogRole"
  | "annualFeeCents"
  | "preapprovalUrl"
  | "historyNeeded"
  | "studentsOnly"
  | "secured"
  | "depositMinCents"
  | "depositMaxCents"
  | "okForRebuilding"
  | "runsCreditCheck"
  | "openToNewApplicants"
> & {
  conditions: Pick<Card["conditions"][number], "kind">[];
  eligibilityEvidence: { historyNeeded: Pick<Card["eligibilityEvidence"]["historyNeeded"], "basis"> };
};

export type RuleAnswers = Pick<
  QuizAnswers,
  "under21" | "incomeBand" | "student" | "standing" | "recentDenial" | "canDeposit" | "goal"
>;

// Answers the rules need before they can tier anything. Goal is optional.
export type AnswerKey = Exclude<keyof RuleAnswers, "goal">;
export type IncomeGateId = "G1" | "G2";
export type GateId = IncomeGateId | "G3" | "G5" | "G6";
export type CautionId = "C1" | "C2" | "C3";
export type NoteId = "N1" | "N2";

export type CardNote = { id: NoteId; text: string };

export type CardFit = {
  cardId: string;
  tier: FitTier;
  // Empty for likely_fit. One gate for not_yet. One or more cautions for stretch.
  ruleIds: (GateId | CautionId)[];
  reasons: string[];
  notes: CardNote[];
};

export type FitResult =
  | { status: "incomplete"; rulesVersion: string; missing: AnswerKey[] }
  | {
      status: "complete";
      rulesVersion: string;
      // Only recommend cards that are open to new applicants (G4) and have a
      // usable history level (rules, sections 3 and 4).
      cards: CardFit[];
      recommendedCardId: string | null;
      // Set only when no card is recommended because of an income gate.
      noCardReason: { ruleId: IncomeGateId; reason: string } | null;
    };

const INCOME_GATE_REASONS: Record<IncomeGateId, string> = {
  G1: "If you are under 21, card issuers have to see income or savings that are your own. Household income does not count. This is a federal rule, not a judgment about you.",
  G2: "Issuers have to check that you can make payments, so they need to see some income or savings.",
};
const G3_REASON = "This card is only for students.";
const G5_REASON = "This card is built for people with a longer credit history than you have so far.";

const C1_REASON = "The issuer says this card is for people with a bit more credit history. It may still work.";
const C1_PREAPPROVAL_REASON =
  "The issuer says this card is for people with a bit more credit history. It may still work, so check preapproval first.";
const C2_REASON =
  "You were turned down recently. Applications close together can count against you. Waiting a few months, or starting with a secured card, gives you better odds.";
const C3_REASON = "This card is not aimed at rebuilding credit.";
const C3_UNSECURED_REASON = "This card is not aimed at rebuilding credit. A secured card is the more reliable next step.";

const LIKELY_FIT_REASON = "You meet what the issuer says this card is for.";
const LIKELY_FIT_PREAPPROVAL_REASON = "You can check preapproval without affecting your credit.";
const NO_PREAPPROVAL_NOTE = "This issuer has no preapproval check, so applying is the only way to find out.";
const NO_CREDIT_CHECK_NOTE = "This card has no credit check to apply.";

const CARD_LEVEL: Record<RuleCard["historyNeeded"], number> = {
  none: 0,
  limited: 1,
  established: 2,
  strong: 3,
};

// "damaged" counts as level 0 and also raises caution C3. "not_sure" counts as none.
const STUDENT_LEVEL: Record<NonNullable<RuleAnswers["standing"]>, number> = {
  none: 0,
  limited: 1,
  established: 2,
  damaged: 0,
  not_sure: 0,
};

const STANDINGS = Object.keys(STUDENT_LEVEL) as (keyof typeof STUDENT_LEVEL)[];

// Every income band, written as a record so the compiler flags a new band.
const INCOME_BAND_KNOWN: Record<NonNullable<RuleAnswers["incomeBand"]>, true> = {
  none: true,
  savings_only: true,
  under_5k: true,
  "5k_to_15k": true,
  over_15k: true,
};
const INCOME_BANDS = Object.keys(INCOME_BAND_KNOWN) as (keyof typeof INCOME_BAND_KNOWN)[];

// Every goal, written as a record so the compiler flags a new goal.
const GOAL_KNOWN: Record<NonNullable<RuleAnswers["goal"]>, true> = {
  build_credit: true,
  learn: true,
  other: true,
};
const GOALS = Object.keys(GOAL_KNOWN) as (keyof typeof GOAL_KNOWN)[];

// Only recommend cards are tiered, and only with a usable history level from
// the issuer, an estimate or a decision (rules, sections 3 and 4). A "silent"
// basis means there is no level. Explore cards stay in the catalog for browsing.
function canBeTiered(card: RuleCard): boolean {
  return (
    card.catalogRole === "recommend" &&
    Object.hasOwn(CARD_LEVEL, card.historyNeeded) &&
    card.eligibilityEvidence.historyNeeded.basis !== "silent"
  );
}

const TIER_RANK: Record<FitTier, number> = { likely_fit: 0, stretch: 1, not_yet: 2 };

type CompleteAnswers = Required<Omit<RuleAnswers, "goal">> & Pick<RuleAnswers, "goal">;

function needsDeposit(card: RuleCard): boolean {
  return card.depositMinCents > 0;
}

function dollars(cents: number): string {
  const wholeDollars = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: wholeDollars ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// G6 reason, built from the card's deposit (rules, section 5).
function depositReason(card: RuleCard): string {
  const min = card.depositMinCents;
  const max = card.depositMaxCents;
  let amount: string;
  if (max === null) amount = `at least ${dollars(min)}`;
  else if (max === min) amount = dollars(min);
  else amount = `${dollars(min)} to ${dollars(max)}`;
  return `This card needs a refundable deposit of ${amount} to open.`;
}

type AnswerCheck = { complete: CompleteAnswers } | { missing: AnswerKey[] };

// The one place that decides whether the answers are complete. Q1 to Q6 are
// always asked (rules, section 2). Goal is optional and never makes answers incomplete.
function checkAnswers(answers: RuleAnswers): AnswerCheck {
  // Callers should pass answers already checked against the schema. As a
  // second guard, a value the schema would reject (null, a wrong type, an
  // unknown choice) counts as missing, so it can never produce a likely fit.
  const under21 = typeof answers.under21 === "boolean" ? answers.under21 : undefined;
  const student = typeof answers.student === "boolean" ? answers.student : undefined;
  const recentDenial = typeof answers.recentDenial === "boolean" ? answers.recentDenial : undefined;
  const canDeposit = typeof answers.canDeposit === "boolean" ? answers.canDeposit : undefined;
  const incomeBand = INCOME_BANDS.find((band) => band === answers.incomeBand);
  const standing = STANDINGS.find((value) => value === answers.standing);
  const goal = GOALS.find((value) => value === answers.goal);
  if (
    under21 !== undefined &&
    incomeBand !== undefined &&
    student !== undefined &&
    standing !== undefined &&
    recentDenial !== undefined &&
    canDeposit !== undefined
  ) {
    return { complete: { under21, incomeBand, student, standing, recentDenial, canDeposit, goal } };
  }
  const missing: AnswerKey[] = [];
  if (under21 === undefined) missing.push("under21");
  if (incomeBand === undefined) missing.push("incomeBand");
  if (student === undefined) missing.push("student");
  if (standing === undefined) missing.push("standing");
  if (recentDenial === undefined) missing.push("recentDenial");
  if (canDeposit === undefined) missing.push("canDeposit");
  return { missing };
}

function incomeGate(answers: CompleteAnswers): IncomeGateId | null {
  if (answers.incomeBand !== "none") return null;
  return answers.under21 ? "G1" : "G2";
}

type GateResult = { id: GateId; reason: string };

function failedGate(answers: CompleteAnswers, card: RuleCard): GateResult | null {
  const income = incomeGate(answers);
  if (income) return { id: income, reason: INCOME_GATE_REASONS[income] };
  if (card.studentsOnly && !answers.student) return { id: "G3", reason: G3_REASON };
  if (CARD_LEVEL[card.historyNeeded] - STUDENT_LEVEL[answers.standing] >= 2) return { id: "G5", reason: G5_REASON };
  if (needsDeposit(card) && !answers.canDeposit) return { id: "G6", reason: depositReason(card) };
  return null;
}

const CAUTION_REASONS: Record<CautionId, (card: RuleCard) => string> = {
  C1: (card) => (card.preapprovalUrl === null ? C1_REASON : C1_PREAPPROVAL_REASON),
  C2: () => C2_REASON,
  C3: (card) => (card.secured ? C3_REASON : C3_UNSECURED_REASON),
};

function cautions(answers: CompleteAnswers, card: RuleCard): CautionId[] {
  const found: CautionId[] = [];
  if (CARD_LEVEL[card.historyNeeded] - STUDENT_LEVEL[answers.standing] === 1) found.push("C1");
  if (answers.recentDenial) found.push("C2");
  if (answers.standing === "damaged" && !card.okForRebuilding) found.push("C3");
  return found;
}

function notes(card: RuleCard): CardNote[] {
  const found: CardNote[] = [];
  if (card.runsCreditCheck && card.preapprovalUrl === null) found.push({ id: "N1", text: NO_PREAPPROVAL_NOTE });
  if (!card.runsCreditCheck) found.push({ id: "N2", text: NO_CREDIT_CHECK_NOTE });
  return found;
}

function likelyFitReasons(card: RuleCard): string[] {
  return card.preapprovalUrl === null
    ? [LIKELY_FIT_REASON]
    : [LIKELY_FIT_REASON, LIKELY_FIT_PREAPPROVAL_REASON];
}

function fitForCard(answers: CompleteAnswers, card: RuleCard): CardFit {
  const base = { cardId: card.id, notes: notes(card) };
  const gate = failedGate(answers, card);
  if (gate) {
    return { ...base, tier: "not_yet", ruleIds: [gate.id], reasons: [gate.reason] };
  }
  const found = cautions(answers, card);
  if (found.length > 0) {
    return { ...base, tier: "stretch", ruleIds: found, reasons: found.map((id) => CAUTION_REASONS[id](card)) };
  }
  return { ...base, tier: "likely_fit", ruleIds: [], reasons: likelyFitReasons(card) };
}

type Candidate = { card: RuleCard; fit: CardFit };

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// true sorts first.
function preferTrue(a: boolean, b: boolean): number {
  if (a === b) return 0;
  return a ? -1 : 1;
}

function suitsRecentDenial(card: RuleCard): boolean {
  return card.secured || card.okForRebuilding;
}

// Only a level the issuer itself publishes counts. An estimate or a team
// decision ranks below it (rules, section 6, step 4). Silent never gets here.
function hasPublishedHistory(card: RuleCard): boolean {
  return card.eligibilityEvidence.historyNeeded.basis === "issuer";
}

function statesUpgradePath(card: RuleCard): boolean {
  return card.conditions.some((condition) => condition.kind === "graduation_review");
}

// Rules, section 6. First-year value is planned, not built: it needs rewards
// data and code that do not exist yet. Until then card ID breaks the last
// ties. A students-only card can only be a candidate for a student: gate G3
// removes it for anyone else.
function compareForPick(answers: CompleteAnswers) {
  return (a: Candidate, b: Candidate): number => {
    // Not yet cards are filtered out before this runs, so the tier step never
    // decides anything the cautions step would not. It stays to mirror the rules.
    if (a.fit.tier !== b.fit.tier) return TIER_RANK[a.fit.tier] - TIER_RANK[b.fit.tier];
    if (a.fit.ruleIds.length !== b.fit.ruleIds.length) return a.fit.ruleIds.length - b.fit.ruleIds.length;
    if (answers.recentDenial) {
      const denial = preferTrue(suitsRecentDenial(a.card), suitsRecentDenial(b.card));
      if (denial !== 0) return denial;
    }
    const published = preferTrue(hasPublishedHistory(a.card), hasPublishedHistory(b.card));
    if (published !== 0) return published;
    const studentCard = preferTrue(a.card.studentsOnly, b.card.studentsOnly);
    if (studentCard !== 0) return studentCard;
    // A card that asks for less credit history is more likely to approve.
    const history = CARD_LEVEL[a.card.historyNeeded] - CARD_LEVEL[b.card.historyNeeded];
    if (history !== 0) return history;
    if (answers.goal === "build_credit") {
      const upgrade = preferTrue(statesUpgradePath(a.card), statesUpgradePath(b.card));
      if (upgrade !== 0) return upgrade;
    }
    const noFee = preferTrue(a.card.annualFeeCents === 0, b.card.annualFeeCents === 0);
    if (noFee !== 0) return noFee;
    const unsecured = preferTrue(!a.card.secured, !b.card.secured);
    if (unsecured !== 0) return unsecured;
    return compareIds(a.card.id, b.card.id);
  };
}

// fits[i] is the fit for tierable[i], so the two are ranked as pairs.
function pickCard(answers: CompleteAnswers, tierable: RuleCard[], fits: CardFit[]): string | null {
  const candidates: Candidate[] = tierable
    .map((card, index) => ({ card, fit: fits[index] }))
    .filter((entry) => entry.fit.tier !== "not_yet");
  return candidates.sort(compareForPick(answers))[0]?.card.id ?? null;
}

export function evaluateFit(answers: RuleAnswers, cards: RuleCard[]): FitResult {
  const check = checkAnswers(answers);
  if ("missing" in check) {
    return { status: "incomplete", rulesVersion: RULES_VERSION, missing: check.missing };
  }
  const complete = check.complete;

  // G4: a card closed to new applicants is not shown at all, so it is dropped
  // first, along with explore cards and any card that cannot be tiered.
  const tierable = cards.filter((card) => card.openToNewApplicants && canBeTiered(card));
  const fits = tierable.map((card) => fitForCard(complete, card));
  const recommendedCardId = pickCard(complete, tierable, fits);
  const income = incomeGate(complete);
  return {
    status: "complete",
    rulesVersion: RULES_VERSION,
    cards: fits,
    recommendedCardId,
    // An income gate fails every card, so then there is never a recommendation.
    noCardReason: income ? { ruleId: income, reason: INCOME_GATE_REASONS[income] } : null,
  };
}
