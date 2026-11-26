// Created with Claude Code (2026-11-26). The words on Pick a goal and Your
// plan. No Figma frames exist for either yet (All Wireframes G1 371:9440:
// "Goals and Invest have no screens yet"), so these are written to the app's
// copy rules: short, plain, no advice.

import type { GoalPreset, SuggestionSource } from "./presets";

export const GOAL_LABELS: Record<GoalPreset, string> = {
  emergency_fund: "Emergency fund",
  pay_off_card: "Pay off my card",
  trip: "Trip",
  car: "Buy a car",
  home: "Buy a home",
  other: "Something else",
};

// Under the amount: the suggestion and where it came from, kept while the
// student types their own. "Suggested $1,240: one month of your rent, bills
// and groceries."
const SUGGESTION_SOURCES: Record<SuggestionSource, string> = {
  essentials: "one month of your rent, bills and groceries",
  starter: "a starter cushion",
  card_balance: "what your card owes today, from your bank",
};

export function suggestionHint(amount: string, source: SuggestionSource): string {
  return `Suggested ${amount}: ${SUGGESTION_SOURCES[source]}.`;
}

export const GOAL_COPY = {
  title: "Pick a goal",
  body: "What are you saving for? You can change it later.",
  moreGoals: "More goals",
  nameLabel: "What is it for?",
  amountLabel: "How much?",
  dateLabel: "By when?",
  dateHint: "Optional. With no date, we plan for 6 months.",
  continue: "See my plan",
  notNow: "Not now",
  remove: "Remove my goal",
  // The one-line confirmation, by what happens to the set-aside.
  removeAsk: "Remove your goal?",
  // What removing the goal, or switching it to Pay off my card, does to the
  // set-aside its accepted plan wrote.
  setAsideStops: (amount: string) => `Your ${amount} a month set-aside stops too.`,
  setAsideStays: (amount: string) => `Your ${amount} a month set-aside stays; change it on Your money.`,
  removeConfirm: "Remove",
  removeKeep: "Keep my goal",
  pickError: "Pick a goal.",
  nameError: "Say what it’s for.",
  amountError: "Enter an amount, like 500.",
  amountTooBig: "Goals go up to $1,000,000.",
  dateAfterToday: "Pick a date after today.",
  dateTooLate: "Pick a date in the next 30 years.",
  // One goal at a time: picking another goal than the saved one replaces it on save.
  replacesGoal: (name: string) => `This replaces your ${name} goal.`,
} as const;

export const PLAN_COPY = {
  title: "Your plan",
  // "Emergency fund: $1,240 by May 26, 2027"
  goalLine: (name: string, amount: string, date: string) => `${name}: ${amount} by ${date}`,
  monthHeading: "Each month",
  income: "Money in",
  bills: "Bills",
  setAside: "Set aside for your goal",
  left: "Left for everything else",
  short: "Short",
  // When the student already kept something aside each month.
  replaces: (amount: string) => `This replaces the ${amount} you set aside before.`,
  // The monthly amount is more than a set-aside can be ($100,000).
  tooMuch: "That’s more than you can set aside in a month. Pick a later date or a smaller amount.",
  // Pay off my card: nothing is set aside (safe to spend already holds the
  // card balance back); the step is paying the statement in full.
  cardLine: (name: string, amount: string) => `${name}: ${amount}`,
  cardHeld: "Safe to spend already holds your card balance back, so nothing more is set aside.",
  cardStep: "Each month, pay the full statement balance.",
  cardAutopay: "Set up autopay",
  cardDone: "Got it",
  // Accept found the goal saved again in another tab; the plan reloads.
  changed: "Your plan changed in another tab. Here it is now.",
  accept: "Accept plan",
  edit: "Edit",
} as const;
