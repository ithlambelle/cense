import { createHash } from "node:crypto";

import type { Student } from "../api/auth";
import { quizAnswersSchema } from "../api/schemas";
import type { Card } from "../cards/catalog";
import { evaluateFit, RULES_VERSION, type FitResult } from "../rules/fit-tier";

// Saves the result the student is shown, so it can be explained later: the
// answers, the full evaluateFit result, and the versions of the rules and the
// card data it ran on. The server works the result out and calls the
// save_recommendation database function with the student's own session, so a
// row can only ever belong to the signed-in student. The client never sends a
// match of its own.

export type RecommendationRecord = {
  p_card_id: string | null;
  p_fit_tier: "likely_fit" | "stretch" | "not_yet";
  p_reason: string | null;
  p_rules_version: string;
  p_card_data_version: string;
  p_answer_snapshot: Record<string, unknown>;
  p_result_snapshot: Extract<FitResult, { status: "complete" }>;
};

// The same key order every time, so two snapshots compare equal however the
// database stored them (jsonb does not keep key order).
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// A short fingerprint of the card data. It changes whenever any card fact
// changes, so each saved result records exactly which data it ran on.
export function cardDataVersion(cards: Card[]): string {
  return `cards-${createHash("sha256").update(stableStringify(cards)).digest("hex").slice(0, 12)}`;
}

// What to save for these answers, or null when the quiz is not finished.
// "No suitable card" saves no card, with the tier not_yet (every card was not
// yet), and the income gate's reason when there is one.
export function recommendationRecord(savedAnswers: unknown, cards: Card[]): RecommendationRecord | null {
  const parsed = quizAnswersSchema.safeParse(savedAnswers ?? {});
  if (!parsed.success) return null;
  const result = evaluateFit(parsed.data, cards);
  if (result.status === "incomplete") return null;

  const fit = result.recommendedCardId === null
    ? undefined
    : result.cards.find((entry) => entry.cardId === result.recommendedCardId);

  return {
    p_card_id: fit ? fit.cardId : null,
    p_fit_tier: fit ? fit.tier : "not_yet",
    p_reason: fit ? (fit.reasons[0] ?? null) : (result.noCardReason?.reason ?? null),
    p_rules_version: RULES_VERSION,
    p_card_data_version: cardDataVersion(cards),
    p_answer_snapshot: parsed.data,
    p_result_snapshot: result,
  };
}

type LatestSaved = {
  answer_snapshot: unknown;
  rules_version: string | null;
  card_data_version: string | null;
} | null;

// True when the latest saved row already holds this exact result, so a
// reload of the result screen does not add a duplicate row.
export function alreadySaved(latest: LatestSaved, record: RecommendationRecord): boolean {
  return (
    latest !== null &&
    latest.rules_version === record.p_rules_version &&
    latest.card_data_version === record.p_card_data_version &&
    stableStringify(latest.answer_snapshot) === stableStringify(record.p_answer_snapshot)
  );
}

export type SaveOutcome = "saved" | "unchanged" | "skipped" | "failed";

// Never throws: a failed save is logged and the result screen still shows.
export async function saveRecommendation(student: Student, savedAnswers: unknown, cards: Card[]): Promise<SaveOutcome> {
  try {
    return await save(student, savedAnswers, cards);
  } catch {
    console.warn(JSON.stringify({ event: "recommendation_save_failed", step: "unexpected" }));
    return "failed";
  }
}

async function save(student: Student, savedAnswers: unknown, cards: Card[]): Promise<SaveOutcome> {
  const record = recommendationRecord(savedAnswers, cards);
  if (!record) return "skipped";

  const latest = await student.supabase
    .from("recommendations")
    .select("answer_snapshot, rules_version, card_data_version")
    .eq("student_id", student.studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) {
    console.warn(JSON.stringify({ event: "recommendation_save_failed", step: "read_latest", code: latest.error.code }));
    return "failed";
  }
  if (alreadySaved(latest.data, record)) return "unchanged";

  const { error } = await student.supabase.rpc("save_recommendation", record);
  if (error) {
    console.warn(JSON.stringify({ event: "recommendation_save_failed", step: "insert", code: error.code }));
    return "failed";
  }
  return "saved";
}
