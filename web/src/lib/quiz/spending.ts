import { QUESTIONS } from "./questions";

// The spending question after question 6 (Flow 3 step 2, Figma 144:2635).
// UI only for now. Ben decided on 2026-10-24 to ask it before the rules use
// it: the answer will change the recommendation later, once rewards data
// exists. Until then it is held on screen only. It is not saved, not sent to
// the API and never sent to analytics, and it is not a QuizAnswers field, so
// drafts saved before it existed still count as complete. It can be skipped:
// Continue works with nothing picked.

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
