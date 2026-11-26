// Created with Claude Code (2026-11-26). Home's one next step (Demo Day step
// 9, Gap Plan "The priority rules"): the first rule, in order, whose trigger
// holds, from plain inputs read on the server. Pure, so every row and the
// order are table-tested (next-step.test.ts).
//
// The order follows the r/personalfinance US flowchart, credited on the card.
// Shipped rows (Ben, Nov 26): 1 Link your bank, 2 Check your budget, 3 Cover
// the essentials, 4 Turn on autopay, 5 Start your emergency fund, 7 Find your
// first card, 9 Your goals. Emergency fund comes before a first card (Ben,
// Nov 21). Rows 6 (Pay down your card, APR 10% or more) and 8 (Grow your
// emergency fund, under 3 months of essentials) are behind the cut line: each
// is one more entry in RULES, in its place, with its id in NEXT_STEP_IDS.

import type { Application } from "@/lib/api/application";
import type { Budget } from "@/lib/api/budget";
import type { Goal } from "@/lib/api/goals";
import type { SafeToSpend } from "@/lib/api/safe-to-spend";
import { EMERGENCY_FLOOR_CENTS, essentialsCents, type GoalPreset } from "@/lib/goals/presets";
import { autopayStepsPath, quizPath, ROUTES, startGoalPath, yourMoneyPath } from "@/lib/routes";

import { NEXT_STEP_COPY } from "./copy";

export const NEXT_STEP_IDS = [
  "link_bank",
  "check_budget",
  "cover_essentials",
  "turn_on_autopay",
  "start_emergency_fund",
  "find_first_card",
  "your_goals",
] as const;
export type NextStepId = (typeof NEXT_STEP_IDS)[number];

export type NextStep = { id: NextStepId; title: string; why: string; action: { label: string; href: string } };

export type NextStepInputs = {
  // The linked bank, or null when none is linked.
  bank: {
    // Penny has read the bank and the setup answers are saved.
    answered: boolean;
    // The student tapped Looks right on last month (profiles.budget_checked_at).
    budgetChecked: boolean;
    // Last full month from the bank: money in and money out (needs and wants,
    // the student's own numbers where they typed one). Null unless the bank's
    // history covers that whole month (a thin read is never judged).
    lastMonth: { incomeCents: number; spentCents: number } | null;
    // One month of rent, bills and groceries (essentialsCents in goals/presets).
    essentialsCents: number;
    // The linked savings accounts' balances added up; null when the bank
    // shows no savings account.
    savingsCents: number | null;
    // The bank shows a credit card.
    hasCardAccount: boolean;
  } | null;
  // The student's approved tracked cards, most recently changed first.
  approvedCards: { applicationId: string; name: string; autopayOn: boolean }[];
  // A tracked card is waiting on the issuer's decision.
  cardApplied: boolean;
  // The card quiz has a result (a match, or no card fits).
  quizComplete: boolean;
  // The student's one goal, or null. accepted: Accept plan has set its money aside.
  goal: { preset: GoalPreset; name: string; accepted: boolean } | null;
};

// The first cushion: $1,000 or one month of essentials, whichever is more,
// the same amount Pick a goal suggests for an emergency fund.
export function emergencyTargetCents(essentialsCents: number): number {
  return Math.max(EMERGENCY_FLOOR_CENTS, essentialsCents);
}

type Rule = (inputs: NextStepInputs) => NextStep | null;

const step = (id: NextStepId, title: string, why: string, label: string, href: string): NextStep => ({ id, title, why, action: { label, href } });

// In order. The first that answers is Home's next step.
const RULES: readonly Rule[] = [
  // 1. No bank linked.
  ({ bank }) => (bank ? null : step("link_bank", NEXT_STEP_COPY.linkBank.title, NEXT_STEP_COPY.linkBank.why, NEXT_STEP_COPY.linkBank.action, ROUTES.safeToSpendConnect)),
  // 2. The bank is not read yet, or last month is not confirmed. The reading
  // screen reads it and ends on Looks right.
  ({ bank }) =>
    bank && (!bank.answered || !bank.budgetChecked)
      ? step("check_budget", NEXT_STEP_COPY.checkBudget.title, NEXT_STEP_COPY.checkBudget.why, NEXT_STEP_COPY.checkBudget.action, ROUTES.safeToSpendReading)
      : null,
  // 3. More went out than came in last month (a whole month only).
  ({ bank }) => {
    const month = bank?.lastMonth;
    if (!month || month.spentCents <= month.incomeCents) return null;
    const copy = NEXT_STEP_COPY.coverEssentials;
    return step("cover_essentials", copy.title, copy.why(month.spentCents, month.incomeCents), copy.action, yourMoneyPath("month"));
  },
  // 4. An approved card without autopay (any autopay pays at least the
  // minimum). The most recently changed one first.
  ({ approvedCards }) => {
    const card = approvedCards.find((entry) => !entry.autopayOn);
    if (!card) return null;
    const copy = NEXT_STEP_COPY.turnOnAutopay;
    return step("turn_on_autopay", copy.title, copy.why(card.name), copy.action, autopayStepsPath(card.applicationId));
  },
  // 5. Savings under the first cushion, and no emergency fund goal started.
  ({ bank, goal }) => {
    if (!bank || goal?.preset === "emergency_fund") return null;
    const target = emergencyTargetCents(bank.essentialsCents);
    if ((bank.savingsCents ?? 0) >= target) return null;
    const copy = NEXT_STEP_COPY.emergencyFund;
    return step("start_emergency_fund", copy.title, copy.why(bank.savingsCents, target), copy.action, startGoalPath("emergency_fund"));
  },
  // 6. Pay down your card: cut for the demo.
  // 7. No credit card: none at the bank, none approved or waiting.
  ({ bank, approvedCards, cardApplied, quizComplete }) => {
    if (!bank || bank.hasCardAccount || approvedCards.length > 0 || cardApplied) return null;
    const copy = NEXT_STEP_COPY.firstCard;
    return quizComplete
      ? step("find_first_card", copy.title, copy.why, copy.seeMatches, ROUTES.results)
      : step("find_first_card", copy.title, copy.why, copy.takeQuiz, quizPath());
  },
  // 8. Grow your emergency fund: cut for the demo.
];

// 9. Otherwise, the student's goal: Your plan for the one they have, or Pick a goal.
function goalsStep({ goal }: NextStepInputs): NextStep {
  const copy = NEXT_STEP_COPY.goals;
  if (!goal) return step("your_goals", copy.title, copy.noGoal, copy.pickGoal, ROUTES.startGoal);
  return step("your_goals", copy.title, goal.accepted ? copy.planSet(goal.name) : copy.planReady(goal.name), copy.seePlan, ROUTES.startPlan);
}

// Always exactly one step.
export function nextStep(inputs: NextStepInputs): NextStep {
  for (const rule of RULES) {
    const found = rule(inputs);
    if (found) return found;
  }
  return goalsStep(inputs);
}

// The rules' inputs from what Home reads: the bank link (null: none), whether
// last month was confirmed, last month's budget only when the bank's history
// covers it whole (null otherwise), every tracked card (most recently changed
// first), the approved cards' names and autopay as Coming up reads them,
// whether the quiz has a result, and the goal.
export function nextStepInputs({
  safeToSpend,
  budgetChecked,
  lastMonth,
  applications,
  approvedCards,
  quizComplete,
  goal,
}: {
  safeToSpend: SafeToSpend | null;
  budgetChecked: boolean;
  lastMonth: Budget | null;
  applications: Application[];
  approvedCards: { applicationId: string; name: string; autopayStatus: string }[];
  quizComplete: boolean;
  goal: Goal | null;
}): NextStepInputs {
  const savings = safeToSpend?.accounts.filter((account) => account.kind === "other") ?? [];
  const spent = lastMonth ? [...lastMonth.needs, ...lastMonth.wants].reduce((sum, line) => sum + line.amountCents, 0) : 0;
  return {
    bank: safeToSpend && {
      answered: safeToSpend.answered,
      budgetChecked,
      lastMonth: lastMonth?.hasBankData ? { incomeCents: lastMonth.income.amountCents, spentCents: spent } : null,
      essentialsCents: essentialsCents(safeToSpend.bills),
      savingsCents: savings.length > 0 ? savings.reduce((sum, account) => sum + account.balanceCents, 0) : null,
      hasCardAccount: safeToSpend.accounts.some((account) => account.kind === "card"),
    },
    approvedCards: applications.flatMap((application) => {
      const card = application.status === "approved" ? approvedCards.find((entry) => entry.applicationId === application.id) : undefined;
      return card ? [{ applicationId: card.applicationId, name: card.name, autopayOn: card.autopayStatus === "on" }] : [];
    }),
    cardApplied: applications.some((application) => application.status === "applied"),
    quizComplete,
    goal: goal && { preset: goal.preset, name: goal.name, accepted: goal.acceptedMonthlyCents !== null },
  };
}
