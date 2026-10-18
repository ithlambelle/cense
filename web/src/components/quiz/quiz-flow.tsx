"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { QuizScreen } from "@/components/quiz/quiz-screen";
import { FailedScreen, LoadingScreen } from "@/components/shell/status-screens";
import { track } from "@/lib/analytics";
import type { QuizField } from "@/lib/analytics-catalog";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { firstUnanswered, helpText, QUESTIONS, savedChoiceId, withChoice } from "@/lib/quiz/questions";
import type { QuizAnswers } from "@/lib/quiz/questions";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";

type Draft = {
  answers: QuizAnswers;
  index: number;
  choiceIds: Record<string, string>;
  // True when the quiz was already complete when opened. A retake holds its
  // edits here and saves them once, at the last question, so closing
  // midway never leaves a result built from old and new answers mixed.
  retake: boolean;
};

// Reads the saved draft. Returns "signed-out" when the session has ended.
async function fetchDraft(): Promise<LoadOutcome<Draft>> {
  const result = await apiRequest("get", "/quiz");
  if (result.ok) {
    const answers = result.data.answers;
    const next = firstUnanswered(answers);
    return { status: "ready", data: { answers, index: next ?? 0, choiceIds: {}, retake: next === null } };
  }
  if (isUnauthorized(result)) return "signed-out";
  // 404 means no saved quiz yet: start at the first question.
  if (result.kind === "api" && result.status === 404) {
    return { status: "ready", data: { answers: {}, index: 0, choiceIds: {}, retake: false } };
  }
  return { status: "failed", message: failureMessage(result) };
}

// How long the chosen answer shows its check before the next question appears,
// so the tap visibly registered. Feedback only: the save itself is not delayed.
export const CHOICE_FEEDBACK_MS = 300;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The quiz against the API. Tapping an answer saves the whole draft and moves
// on. A retake saves only at the last question (see Draft). Answers are kept
// in memory only: never in the address bar, a cookie or browser storage.
export function QuizFlow() {
  const { loaded, retry } = useLoaded(fetchDraft, signInPath(ROUTES.quiz));
  if (loaded.status === "loading") return <LoadingScreen label="Loading your quiz" />;
  if (loaded.status === "failed") {
    return <FailedScreen title="We couldn’t load your quiz" message={loaded.message} onRetry={retry} />;
  }
  return <QuizSteps saved={loaded.data} />;
}

// One question at a time, starting from the saved draft.
function QuizSteps({ saved }: { saved: Draft }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [draft, setDraft] = useState<Draft>(saved);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { answers, index, choiceIds, retake } = draft;
  const question = QUESTIONS[index];
  const isLast = index === QUESTIONS.length - 1;

  async function choose(choiceId: string) {
    const choice = question.choices.find((entry) => entry.id === choiceId);
    if (!choice || saving) return;
    const nextAnswers = withChoice(answers, choice);
    const nextChoiceIds = { ...choiceIds, [question.field]: choiceId };
    setSaveError(null);
    setSaving(true);
    setDraft({ index, answers: nextAnswers, choiceIds: nextChoiceIds, retake });
    if (retake && !isLast) {
      // Nothing is saved yet: the edits stay here until the last question.
      track("quiz_step_completed", { step: index + 1, field: question.field as QuizField, retake });
      await wait(CHOICE_FEEDBACK_MS);
      setSaving(false);
      setDraft({ answers: nextAnswers, choiceIds: nextChoiceIds, retake, index: index + 1 });
      return;
    }
    // The API replaces the whole answers object, so the full draft is sent.
    const [result] = await Promise.all([
      apiRequest("put", "/quiz", { body: { answers: nextAnswers } }),
      wait(CHOICE_FEEDBACK_MS),
    ]);
    // The student left (the bottom bar stays usable while a save is in flight).
    if (!isMounted()) return;
    if (!result.ok) {
      setSaving(false);
      if (isUnauthorized(result)) {
        router.replace(signInPath(ROUTES.quiz));
        return;
      }
      setSaveError(failureMessage(result));
      return;
    }
    // A fresh quiz: nothing was saved before this answer.
    if (!retake && Object.keys(answers).length === 0) track("quiz_started");
    // The answer itself is never sent, only which question was answered.
    track("quiz_step_completed", { step: index + 1, field: question.field as QuizField, retake });
    if (isLast) {
      track("quiz_completed", { retake });
      // Stays locked while the result screen loads.
      router.push(ROUTES.results);
      return;
    }
    setSaving(false);
    setDraft({ answers: nextAnswers, choiceIds: nextChoiceIds, retake, index: index + 1 });
  }

  function back() {
    setSaveError(null);
    if (index === 0) {
      router.push(ROUTES.home);
      return;
    }
    setDraft({ answers, choiceIds, retake, index: index - 1 });
  }

  return (
    <QuizScreen
      question={question}
      step={index + 1}
      total={QUESTIONS.length}
      help={helpText(question, answers)}
      selectedChoiceId={choiceIds[question.field] ?? savedChoiceId(question, answers)}
      onChoose={choose}
      onBack={back}
      onClose={() => router.push(ROUTES.home)}
      pending={saving}
      error={saveError}
    />
  );
}
