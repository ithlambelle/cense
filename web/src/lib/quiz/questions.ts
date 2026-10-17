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
  // The line under the title, from the hi-fi frames.
  subtitle: string;
  choices: Choice[];
};

// Wording follows the newest hi-fi quiz frames (Wireframes Prototyping, 397:1208
// to 397:906). There is no "Under 18" choice: Ben decided on 2026-10-16 that the
// two age choices make the minimum clear; the rules' under-18 exit comes later.
export const QUESTIONS: Question[] = [
  {
    field: "under21",
    title: "How old are you?",
    subtitle: "Some cards have age requirements.",
    choices: [
      { id: "18-to-20", label: "18 to 20", stores: { under21: true } },
      { id: "21-or-over", label: "21 or over", stores: { under21: false } },
    ],
  },
  {
    field: "incomeBand",
    title: "About how much income do you have in a year?",
    // The frame continues "Part-time jobs, stipends, and allowances all count."
    // That is replaced by the age-specific line from helpText (rules v1.2, Q2),
    // because issuers may only count an under-21 student's own income.
    subtitle: "A rough guess is fine.",
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
    subtitle: "Student cards are made for people just starting out.",
    choices: [
      { id: "yes", label: "Yes", stores: { student: true } },
      { id: "no", label: "No", stores: { student: false } },
    ],
  },
  {
    field: "standing",
    title: "Do you have credit in your own name?",
    subtitle: "No credit yet? Totally normal for students.",
    choices: [
      { id: "none", label: "None", stores: { standing: "none" } },
      { id: "authorized-user", label: "Authorized user on someone else’s card", stores: { standing: "limited" } },
      {
        id: "under-6-months",
        label: "A loan or card open less than 6 months",
        stores: { standing: "limited" },
      },
      { id: "6-months-on-time", label: "One open 6+ months and paid on time", stores: { standing: "established" } },
      { id: "missed-payments", label: "Missed payments or collections", stores: { standing: "damaged" } },
      // Stored as said; the rules count it as none (rules v1.2, section 2).
      { id: "not-sure", label: "Not sure", stores: { standing: "not_sure" } },
    ],
  },
  {
    field: "recentDenial",
    title: "Turned down for a credit card in the last 6 months?",
    subtitle: "No judgment. It just helps us skip cards that would say no.",
    choices: [
      { id: "yes", label: "Yes", stores: { recentDenial: true } },
      { id: "no", label: "No", stores: { recentDenial: false } },
    ],
  },
  {
    field: "canDeposit",
    title: "Could you put down a refundable deposit of up to $200?",
    subtitle: "You get it back. It’s what secured cards use to get you started.",
    choices: [
      { id: "yes", label: "Yes", stores: { canDeposit: true } },
      { id: "no", label: "No", stores: { canDeposit: false } },
    ],
  },
];

const INCOME_HELP_UNDER_21 = "Count your own independent income.";
const INCOME_HELP_21_OR_OVER = "Count income you can reasonably access.";

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
// same value, the first one listed is shown.
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
