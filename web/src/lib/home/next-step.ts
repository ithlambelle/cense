// Created with Claude Code (2026-11-26). Home's one next step (Demo Day step
// 9, Gap Plan "The priority rules"): the first rule, in order, whose trigger
// holds, from plain inputs read on the server. Pure, so every row and the
// order are table-tested (next-step.test.ts).
//
// The order follows the r/personalfinance US flowchart, credited on the card.
// Shipped rows (Ben, Nov 26): 1 Link your bank, 2 Check your budget, 3 Cover
// the essentials, 4 Turn on autopay, 5 Start your emergency fund, 7 Find a
// card that fits, 9 Your goals. Emergency fund comes before a card (Ben,
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
  "find_a_card",
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
    // The linked savings and similar accounts (money market, CD, HSA: the
    // kind is all that is stored) added up; null when the bank shows none.
    savingsCents: number | null;
    // The bank shows a credit card.
    hasCardAccount: boolean;
  } | null;
  // The student's approved tracked cards, most recently changed first, except
  // the one Home leads with (its own star already asks for autopay). autopay
  // "unknown": the student has not said (a card added by hand starts so).
  approvedCards: { applicationId: string; name: string; autopay: "on" | "off" | "unknown" }[];
  // Any tracked card: approved (the one Home leads with included), waiting
  // on the issuer, or turned down (another hard check right after a denial is
  // not the next step).
  cardTracked: boolean;
  // Where the card quiz stands: not finished, a match, or no card fits.
  quiz: "unfinished" | "match" | "no_card";
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
  // 2. The bank is not read yet, or what Penny found is not confirmed. The
  // reading screen reads it and ends on Looks right (with last month only
  // when the bank's history covers it, so the words never promise it).
  ({ bank }) => {
    if (!bank || (bank.answered && bank.budgetChecked)) return null;
    const copy = NEXT_STEP_COPY.checkBudget;
    return bank.answered
      ? step("check_budget", copy.title, copy.whyRead, copy.check, ROUTES.safeToSpendReading)
      : step("check_budget", copy.title, copy.whyUnread, copy.read, ROUTES.safeToSpendReading);
  },
  // 3. More went out than came in last month (a whole month only).
  ({ bank }) => {
    const month = bank?.lastMonth;
    if (!month || month.spentCents <= month.incomeCents) return null;
    const copy = NEXT_STEP_COPY.coverEssentials;
    return step("cover_essentials", copy.title, copy.why(month.spentCents, month.incomeCents), copy.action, yourMoneyPath("month"));
  },
  // 4. An approved card without autopay (any autopay pays at least the
  // minimum). The most recently changed one first. Said as missing only when
  // the student said it is off; unknown is asked.
  ({ approvedCards }) => {
    const card = approvedCards.find((entry) => entry.autopay !== "on");
    if (!card) return null;
    const copy = NEXT_STEP_COPY.turnOnAutopay;
    const why = card.autopay === "off" ? copy.whyOff(card.name) : copy.whyUnknown(card.name);
    return step("turn_on_autopay", copy.title, why, copy.action, autopayStepsPath(card.applicationId));
  },
  // 5. Savings under the first cushion, and no emergency fund goal started.
  // A plan the student accepted for another goal stands: Home does not push
  // them to replace it (Gap Plan: show, don't prescribe). A goal only saved
  // still gets the cushion first; Pick a goal says it replaces that goal.
  ({ bank, goal }) => {
    if (!bank || goal?.preset === "emergency_fund" || goal?.accepted) return null;
    const target = emergencyTargetCents(bank.essentialsCents);
    if ((bank.savingsCents ?? 0) >= target) return null;
    const copy = NEXT_STEP_COPY.emergencyFund;
    return step("start_emergency_fund", copy.title, copy.why(bank.savingsCents, target), copy.action, startGoalPath("emergency_fund"));
  },
  // 6. Pay down your card: cut for the demo.
  // 7. No credit card: none at the bank, none tracked. The button follows
  // the quiz: take it, see its matches, or see why none fits yet.
  ({ bank, cardTracked, quiz }) => {
    if (!bank || bank.hasCardAccount || cardTracked) return null;
    const copy = NEXT_STEP_COPY.findCard;
    if (quiz === "unfinished") return step("find_a_card", copy.title, copy.why, copy.takeQuiz, quizPath());
    return step("find_a_card", copy.title, copy.why, quiz === "match" ? copy.seeMatches : copy.seeWhy, ROUTES.results);
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
// first), the approved cards' names and autopay as Coming up reads them, the
// card Home leads with, where the quiz stands, and the goal.
export function nextStepInputs({
  safeToSpend,
  budgetChecked,
  lastMonth,
  applications,
  approvedCards,
  leadingCardId,
  quiz,
  goal,
}: {
  safeToSpend: SafeToSpend | null;
  budgetChecked: boolean;
  lastMonth: Budget | null;
  applications: Application[];
  approvedCards: { applicationId: string; name: string; autopayStatus: string }[];
  // The approved card Home leads with, whose star carries its autopay; null when none.
  leadingCardId: string | null;
  quiz: NextStepInputs["quiz"];
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
      if (application.status !== "approved" || application.id === leadingCardId) return [];
      const card = approvedCards.find((entry) => entry.applicationId === application.id);
      if (!card) return [];
      const autopay = card.autopayStatus === "on" || card.autopayStatus === "off" ? card.autopayStatus : "unknown";
      return [{ applicationId: card.applicationId, name: card.name, autopay }];
    }),
    cardTracked: applications.length > 0,
    quiz,
    goal: goal && { preset: goal.preset, name: goal.name, accepted: goal.acceptedMonthlyCents !== null },
  };
}
