import type { z } from "zod";

import { quizAnswersSchema } from "@/lib/api/schemas";

type QuizAnswers = z.infer<typeof quizAnswersSchema>;

// Each field is checked on its own; unknown keys and invalid values are dropped.
export function validAnswers(stored: unknown): { kept: QuizAnswers; dropped: boolean } {
  const whole = quizAnswersSchema.safeParse(stored);
  if (whole.success) return { kept: whole.data, dropped: false };
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return { kept: {}, dropped: true };
  const kept: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(quizAnswersSchema.shape)) {
    const value = (stored as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const parsed = field.safeParse(value);
    if (parsed.success) kept[key] = parsed.data;
  }
  return { kept: kept as QuizAnswers, dropped: true };
}
