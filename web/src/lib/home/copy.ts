// Created with Claude Code (2026-11-26). The words of Home's next step card
// (Flow 1 N1, Figma 821:8595): its eyebrow, the "Why this step first" box,
// the credit to the flowchart the order comes from, and each step's title, why
// line and button. Only N1's own step (Find your first card) is drawn; the
// rest follow its pattern and are proposed to Ben and design.

import { moneyAmount } from "@/lib/money";

export const NEXT_STEP_CARD_COPY = {
  eyebrow: "Your next step",
  whyTitle: "Why this step first",
  // The order follows the r/personalfinance US flowchart (Gap Plan, "The
  // priority rules"); the general rule is credited to its source, never "you should".
  credit: "Order from the r/personalfinance flowchart.",
} as const;

export const NEXT_STEP_COPY = {
  linkBank: {
    title: "Link your bank",
    why: "Your next steps come from your own balances and bills. Cense only reads them.",
    action: "Link your bank",
  },
  checkBudget: {
    title: "Check your budget",
    why: "Every step after this uses last month’s numbers, so make sure they’re right.",
    action: "Check last month",
  },
  coverEssentials: {
    title: "Cover the essentials first",
    why: (spentCents: number, incomeCents: number) =>
      `Last month ${moneyAmount(spentCents)} went out and ${moneyAmount(incomeCents)} came in. Rent, bills and food come first.`,
    action: "See your month",
  },
  turnOnAutopay: {
    title: "Turn on autopay",
    why: (cardName: string) => `${cardName} has no autopay yet. Paying at least the minimum on time avoids late fees and protects your credit.`,
    action: "Turn on autopay",
  },
  emergencyFund: {
    title: "Start your emergency fund",
    // savingsCents null: no savings account at the linked bank.
    why: (savingsCents: number | null, targetCents: number) =>
      `${savingsCents === null ? "Cense doesn’t see a savings account." : `You have ${moneyAmount(savingsCents)} in savings.`} A first cushion is $1,000, or a month of rent, bills and groceries if that’s more: ${moneyAmount(targetCents)} for you.`,
    action: "Start my emergency fund",
  },
  firstCard: {
    title: "Find your first card",
    // N1's own words (821:8609).
    why: "We didn’t see a credit card at your bank. A first card, used lightly and paid in full, starts your credit history.",
    // N1's button before the quiz; after it, the matches it found.
    takeQuiz: "Take the card quiz",
    seeMatches: "See your matches",
  },
  goals: {
    title: "Your goals",
    noGoal: "Pick something to save for. Cense builds a plan around your bills.",
    planReady: (name: string) => `Your plan for ${name} is ready. Accept it to set money aside each month.`,
    planSet: (name: string) => `Your plan for ${name} is set. Change it anytime.`,
    pickGoal: "Pick a goal",
    seePlan: "See your plan",
  },
} as const;
