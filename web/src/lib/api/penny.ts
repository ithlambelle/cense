import { z } from "zod";

import { PENNY_TOPICS } from "@/lib/penny/answers";

// The longest typed question Penny takes. Students ask in a line or two.
export const MAX_QUESTION_LENGTH = 300;

// POST /penny: one typed question. Tapped questions never call the API: their
// checked answers ship with the app (lib/penny/answers.ts).
export const askPennySchema = z.strictObject({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
});

const questionRefSchema = z.strictObject({ id: z.string(), question: z.string() });

// The checked answer a reply is drawn from: its source is shown under the
// reply, and its topic is where "More about" leads.
const answerRefSchema = z.strictObject({
  id: z.string(),
  question: z.string(),
  topic: z.enum(PENNY_TOPICS.map((topic) => topic.slug) as [string, ...string[]]),
  source: z.strictObject({ name: z.string(), url: z.url() }),
});

export const pennyReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("answer"),
    text: z.string(),
    answer: answerRefSchema,
  }),
  z.strictObject({
    kind: z.literal("declined"),
    // advice: what to do with their own money; off_topic: not about money;
    // unknown: no checked answer covers it; crisis: the 988 line.
    reason: z.enum(["advice", "off_topic", "unknown", "crisis"]),
    text: z.string(),
    // Up to two questions Penny can answer instead (none for a crisis).
    suggestions: z.array(questionRefSchema).max(2),
  }),
]);

export type PennyReply = z.infer<typeof pennyReplySchema>;
