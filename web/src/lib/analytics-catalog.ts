import { z } from "zod";

import { PENNY_ANSWER_IDS } from "./penny/answers";

// The tracking plan: every analytics event Cense sends, the question it
// answers, who owns it, the plan version it arrived in, and the only
// properties it may carry. `track()` in analytics.ts is the only way to send
// an event, and it rejects anything not described here. docs/analytics-events.md
// is generated from this file (npm run analytics:docs).
//
// Naming: snake_case, the object then a past-tense verb (quiz_completed), never
// built at runtime and never renamed; a changed meaning gets a new event. No
// email, name, income band, denial history, credit limit or typed text in any
// property. Card ids are catalog ids, the same for every student.
//
// Business facts (an issuer click, an application) are rows in Postgres first;
// the events below that copy them say which table holds the record.

// Bump when an event or property is added, changed or removed.
export const TRACKING_PLAN_VERSION = 2;

const cardId = z.string().regex(/^[a-z0-9-]{1,100}$/);
const fitTier = z.enum(["likely_fit", "stretch", "not_yet"]);

// The answer fields the quiz asks about, in order (a test keeps this in step
// with lib/quiz/questions.ts).
export const QUIZ_FIELDS = ["under21", "incomeBand", "student", "standing", "recentDenial", "canDeposit"] as const;

export type QuizField = (typeof QUIZ_FIELDS)[number];

type CatalogEntry = {
  question: string;
  owner: string;
  addedIn: number;
  properties: z.ZodObject;
  ledger?: string;
};

export const EVENTS = {
  quiz_started: {
    question: "How many students begin the quiz?",
    owner: "Ben",
    addedIn: 1,
    properties: z.strictObject({}),
  },
  quiz_step_completed: {
    question: "Where in the quiz do students stop? Read the last step each student reached.",
    owner: "Ben",
    addedIn: 1,
    properties: z.strictObject({
      step: z.int().min(1).max(QUIZ_FIELDS.length),
      field: z.enum(QUIZ_FIELDS),
      retake: z.boolean(),
    }),
  },
  quiz_completed: {
    question: "How many students finish the quiz, first time or retake?",
    owner: "Ben",
    addedIn: 1,
    properties: z.strictObject({ retake: z.boolean() }),
  },
  recommendation_viewed: {
    question: "Which approval-fit tiers do students see? card_id is null when no card fits yet.",
    owner: "Ben",
    addedIn: 1,
    properties: z.strictObject({
      tier: fitTier,
      card_id: cardId.nullable(),
      has_alternative: z.boolean(),
    }),
  },
  card_details_viewed: {
    question: "Which cards do visitors open, and are they signed in?",
    owner: "Ben",
    addedIn: 1,
    properties: z.strictObject({ card_id: cardId, signed_in: z.boolean() }),
  },
  issuer_link_clicked: {
    question: "D24 number one and falsifier F1: did the student trust Cense enough to go to the issuer?",
    owner: "Ben",
    addedIn: 1,
    ledger: "issuer_clicks (the event uuid and click_id are the row id)",
    properties: z.strictObject({
      click_id: z.uuid(),
      card_id: cardId,
      link_type: z.enum(["preapproval", "apply"]),
    }),
  },
  outcome_reported: {
    question:
      "D24 number two: what do students tell us happened? applied and didnt_apply come from the did-you-apply prompt, approved, denied and pending from marking a result.",
    owner: "Ben",
    addedIn: 1,
    ledger: "card_applications (applied, approved, denied); pending and didnt_apply are not stored",
    properties: z.strictObject({
      outcome: z.enum(["applied", "didnt_apply", "approved", "denied", "pending"]),
      source: z.enum(["did_you_apply", "mark_result"]),
    }),
  },
  denial_letter_answered: {
    question: "After a denial, do students know the reason yet, or think it was a mistake?",
    owner: "Ben",
    addedIn: 1,
    properties: z.strictObject({ answer: z.enum(["knows_reason", "waiting_on_letter", "thinks_mistake"]) }),
  },
  denial_plan_viewed: {
    question: "How many denied students open the five-step plan?",
    owner: "Ben",
    addedIn: 1,
    properties: z.strictObject({}),
  },
  card_added: {
    question: "How many students track a card Cense did not recommend?",
    owner: "Ben",
    addedIn: 1,
    properties: z.strictObject({ method: z.enum(["manual"]) }),
  },
  penny_question_asked: {
    question:
      "S34's cut rule: do students use Ask Penny, how (tapped or typed), and how often does Penny answer rather than decline or fail? Never the question's text.",
    owner: "Ben",
    addedIn: 2,
    properties: z.strictObject({
      // starter: on Learn; topic: on a topic page; suggestion: offered in the
      // chat; typed: asked in words; link: opened from anywhere else.
      source: z.enum(["starter", "topic", "suggestion", "typed", "link"]),
      outcome: z.enum(["answered", "advice", "off_topic", "unknown", "crisis", "limit", "unavailable", "offline", "signed_out"]),
      // The checked answer shown, the same id for every student.
      answer_id: z.enum(PENNY_ANSWER_IDS).optional(),
    }),
  },
} satisfies Record<string, CatalogEntry>;

export type AnalyticsEvent = keyof typeof EVENTS;
export type EventProperties<E extends AnalyticsEvent> = z.infer<(typeof EVENTS)[E]["properties"]>;
// True for events that carry no properties (quiz_started), which may leave them out.
export type HasNoProperties<E extends AnalyticsEvent> = keyof (typeof EVENTS)[E]["properties"]["shape"] extends never ? true : false;
