import type { z } from "zod";

import type { spendingBandSchema, spendingCategorySchema } from "../api/schemas";
import { QUESTIONS } from "./questions";
import type { QuizAnswers } from "./questions";

// The spending question after question 6 (Flow 3 step 2, Figma 144:2635).
// Ben asked it on 2026-10-24 before anything used it, holding the answer on
// screen only until rewards data existed. On 2026-11-07, with rewards data for
// every card, he reversed that: the answer is now saved with the quiz draft
// (spendingCategories, spendingBand), breaks the last ties in the card order
// by estimated year-one value and shows that value (lib/results/value.ts). It never decides fit, is never sent to
// analytics, and stays optional, so drafts saved before it count as complete.
// It can be skipped: Continue works with nothing picked, and clearing the
// picks clears the saved answer.

export type SpendingOption = { id: string; label: string };

export type SpendingAnswer = { categories: string[]; amount: string | null };

export const SPENDING_COPY = {
  title: "Where does most of your money go?",
  subtitle: "Pick up to two. We use it to estimate rewards.",
  amountLabel: "About how much on a card each month?",
} as const;

export const SPENDING_CATEGORIES: SpendingOption[] = [
  { id: "food-and-dining", label: "Food and dining" },
  { id: "groceries", label: "Groceries" },
  { id: "gas-and-rides", label: "Gas and rides" },
  { id: "travel-home", label: "Travel home" },
  { id: "shopping-and-subscriptions", label: "Shopping and subscriptions" },
];

export const SPENDING_AMOUNTS: SpendingOption[] = [
  { id: "under-200", label: "Under $200" },
  { id: "200-to-500", label: "$200 to $500" },
  { id: "over-500", label: "Over $500" },
];

export const MAX_CATEGORIES = 2;

export const NO_SPENDING: SpendingAnswer = { categories: [], amount: null };

// Screens in the quiz: the six rules questions, then the spending question.
export const QUIZ_STEP_COUNT = QUESTIONS.length + 1;

// Tapping a picked category unpicks it. A third pick replaces the oldest, so
// a tap always does something and there are never more than two.
export function toggleCategory(picked: string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((entry) => entry !== id);
  return [...picked, id].slice(-MAX_CATEGORIES);
}

// One amount at most. Tapping the chosen one clears it.
export function toggleAmount(current: string | null, id: string): string | null {
  return current === id ? null : id;
}

export type SavedSpendingCategory = z.infer<typeof spendingCategorySchema>;
export type SpendingBand = z.infer<typeof spendingBandSchema>;

// Screen ids (kebab-case, as the rewards data names them) to saved values
// (snake_case, as the API names them). A test checks both sides list the
// same options.
export const SAVED_CATEGORY: Readonly<Record<string, SavedSpendingCategory>> = {
  "food-and-dining": "food_and_dining",
  groceries: "groceries",
  "gas-and-rides": "gas_and_rides",
  "travel-home": "travel_home",
  "shopping-and-subscriptions": "shopping_and_subscriptions",
};

export const SAVED_BAND: Readonly<Record<string, SpendingBand>> = {
  "under-200": "under_200",
  "200-to-500": "200_to_500",
  "over-500": "over_500",
};

function screenId<T extends string>(saved: Readonly<Record<string, T>>, value: T): string | undefined {
  return Object.keys(saved).find((id) => saved[id] === value);
}

// The answer as the screen shows it, from a saved draft (a retake starts
// from what was saved). Values the screen does not know are dropped.
export function spendingFromAnswers(answers: QuizAnswers): SpendingAnswer {
  const categories = (answers.spendingCategories ?? [])
    .map((value) => screenId(SAVED_CATEGORY, value))
    .filter((id): id is string => id !== undefined)
    .slice(0, MAX_CATEGORIES);
  const amount = answers.spendingBand ? (screenId(SAVED_BAND, answers.spendingBand) ?? null) : null;
  return { categories, amount };
}

// The draft with the spending answer in it. Nothing picked removes the saved
// field, so clearing the picks clears the answer.
export function withSpending(answers: QuizAnswers, spending: SpendingAnswer): QuizAnswers {
  const next: QuizAnswers = { ...answers };
  delete next.spendingCategories;
  delete next.spendingBand;
  const categories = spending.categories
    .map((id) => SAVED_CATEGORY[id])
    .filter((value): value is SavedSpendingCategory => value !== undefined);
  if (categories.length > 0) next.spendingCategories = categories;
  const band = spending.amount === null ? undefined : SAVED_BAND[spending.amount];
  if (band) next.spendingBand = band;
  return next;
}

// True when the two drafts hold the same spending answer, so Continue can
// skip a save that would change nothing.
export function sameSpending(a: QuizAnswers, b: QuizAnswers): boolean {
  return (
    a.spendingBand === b.spendingBand &&
    (a.spendingCategories ?? []).join(",") === (b.spendingCategories ?? []).join(",")
  );
}
