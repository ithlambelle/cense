import type { z } from "zod";

import type { quizAnswersSchema } from "../api/schemas";

export type QuizAnswers = z.infer<typeof quizAnswersSchema>;

export type Choice = {
  // Unique within its question. Two choices may store the same answer.
  id: string;
  label: string;
  // What choosing this stores. Field names and values come from the schema.
  stores: Partial<QuizAnswers>;
};

export type Question = {
  // The answer field this question fills.
  field: keyof QuizAnswers;
  title: string;
  choices: Choice[];
};

// Wording follows the hi-fi screens, except where "Fit Tier Rules v1.0"
// section 2 requires more (question 4's third choice and the income help text).
export const QUESTIONS: Question[] = [
  {
    field: "under21",
    title: "How old are you?",
    choices: [
      { id: "18-to-20", label: "18 to 20", stores: { under21: true } },
      { id: "21-or-over", label: "21 or over", stores: { under21: false } },
    ],
  },
  {
    field: "incomeBand",
    title: "About how much income do you have in a year?",
    choices: [
      { id: "none", label: "None", stores: { incomeBand: "none" } },
      { id: "savings-only", label: "No income but savings in my name", stores: { incomeBand: "savings_only" } },
      { id: "under-5k", label: "Under $5k", stores: { incomeBand: "under_5k" } },
      { id: "5k-to-15k", label: "$5k to $15k", stores: { incomeBand: "5k_to_15k" } },
      { id: "over-15k", label: "Over $15k", stores: { incomeBand: "over_15k" } },
    ],
  },
  {
    field: "student",
    title: "Are you enrolled at a US college, or admitted and starting within 3 months?",
    choices: [
      { id: "yes", label: "Yes", stores: { student: true } },
      { id: "no", label: "No", stores: { student: false } },
    ],
  },
  {
    field: "standing",
    title: "Credit in your own name?",
    choices: [
      { id: "none", label: "None", stores: { standing: "none" } },
      { id: "authorized-user", label: "Authorized user on someone else’s card", stores: { standing: "limited" } },
      {
        id: "under-6-months",
        label: "A loan or card open less than 6 months (a student loan counts)",
        stores: { standing: "limited" },
      },
      { id: "6-months-on-time", label: "One open 6+ months and paid on time", stores: { standing: "established" } },
      { id: "missed-payments", label: "Missed payments or collections", stores: { standing: "damaged" } },
      // "Not sure" counts as none (rules, section 2).
      { id: "not-sure", label: "Not sure", stores: { standing: "none" } },
    ],
  },
  {
    field: "recentDenial",
    title: "Turned down for a credit card in the last 6 months?",
    choices: [
      { id: "yes", label: "Yes", stores: { recentDenial: true } },
      { id: "no", label: "No", stores: { recentDenial: false } },
    ],
  },
  {
    field: "canDeposit",
    title: "Could you put down a refundable deposit of up to $200?",
    choices: [
      { id: "yes", label: "Yes", stores: { canDeposit: true } },
      { id: "no", label: "No", stores: { canDeposit: false } },
    ],
  },
];

const INCOME_HELP_UNDER_21 =
  "Count only money that is yours: pay from a job, money regularly put into an account in your name, student loan money left after your school is paid.";
const INCOME_HELP_21_OR_OVER = "Your income, plus household income you can reasonably use.";

// Only the income question has help text, and it depends on the age answer.
export function helpText(question: Question, answers: QuizAnswers): string | null {
  if (question.field !== "incomeBand" || answers.under21 === undefined) return null;
  return answers.under21 ? INCOME_HELP_UNDER_21 : INCOME_HELP_21_OR_OVER;
}

// Returns a new answers object. Never changes the one passed in.
export function withChoice(answers: QuizAnswers, choice: Choice): QuizAnswers {
  return { ...answers, ...choice.stores };
}

// The choice to show as selected for saved answers. When two choices store the
// same value ("None" and "Not sure"), the first one listed is shown.
export function savedChoiceId(question: Question, answers: QuizAnswers): string | null {
  const saved = answers[question.field];
  if (saved === undefined) return null;
  return question.choices.find((choice) => choice.stores[question.field] === saved)?.id ?? null;
}

// Index of the first question with no answer, or null when all are answered.
export function firstUnanswered(answers: QuizAnswers): number | null {
  const index = QUESTIONS.findIndex((question) => answers[question.field] === undefined);
  return index === -1 ? null : index;
}
