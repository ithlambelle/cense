"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { QuizScreen } from "@/components/quiz/quiz-screen";
import { FailedScreen, LoadingScreen } from "@/components/shell/status-screens";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { firstUnanswered, helpText, QUESTIONS, savedChoiceId, withChoice } from "@/lib/quiz/questions";
import type { QuizAnswers } from "@/lib/quiz/questions";
import { reportError } from "@/lib/report-error";
import { ROUTES, signInPath } from "@/lib/routes";
import { LOAD_FAILED_MESSAGE } from "@/lib/use-loaded";

type Draft =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | {
      status: "ready";
      answers: QuizAnswers;
      index: number;
      choiceIds: Record<string, string>;
      // True when the quiz was already complete when opened. A retake holds its
      // edits here and saves them once, at the last question, so closing
      // midway never leaves a result built from old and new answers mixed.
      retake: boolean;
    };

// Reads the saved draft. Returns "signed-out" when the session has ended.
async function fetchDraft(): Promise<Draft | "signed-out"> {
  const result = await apiRequest("get", "/quiz");
  if (result.ok) {
    const answers = result.data.answers;
    const next = firstUnanswered(answers);
    return { status: "ready", answers, index: next ?? 0, choiceIds: {}, retake: next === null };
  }
  if (isUnauthorized(result)) return "signed-out";
  // 404 means no saved quiz yet: start at the first question.
  if (result.kind === "api" && result.status === 404) {
    return { status: "ready", answers: {}, index: 0, choiceIds: {}, retake: false };
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
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetchDraft()
      .catch((error: unknown): Draft => {
        reportError("QuizFlow load", error);
        return { status: "failed", message: LOAD_FAILED_MESSAGE };
      })
      .then((loaded) => {
        if (!current) return;
        if (loaded === "signed-out") {
          router.replace(signInPath(ROUTES.quiz));
          return;
        }
        setDraft(loaded);
      });
    return () => {
      current = false;
    };
  }, [router, attempt]);

  if (draft.status === "loading") return <LoadingScreen label="Loading your quiz" />;

  if (draft.status === "failed") {
    return (
      <FailedScreen
        title="We couldn’t load your quiz"
        message={draft.message}
        onRetry={() => {
          setDraft({ status: "loading" });
          setAttempt(attempt + 1);
        }}
      />
    );
  }

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
    setDraft({ status: "ready", index, answers: nextAnswers, choiceIds: nextChoiceIds, retake });
    if (retake && !isLast) {
      // Nothing is saved yet: the edits stay here until the last question.
      await wait(CHOICE_FEEDBACK_MS);
      setSaving(false);
      setDraft({ status: "ready", answers: nextAnswers, choiceIds: nextChoiceIds, retake, index: index + 1 });
      return;
    }
    // The API replaces the whole answers object, so the full draft is sent.
    const [result] = await Promise.all([
      apiRequest("put", "/quiz", { body: { answers: nextAnswers } }),
      wait(CHOICE_FEEDBACK_MS),
    ]);
    if (!result.ok) {
      setSaving(false);
      if (isUnauthorized(result)) {
        router.replace(signInPath(ROUTES.quiz));
        return;
      }
      setSaveError(failureMessage(result));
      return;
    }
    if (isLast) {
      // Stays locked while the result screen loads.
      router.push(ROUTES.results);
      return;
    }
    setSaving(false);
    setDraft({ status: "ready", answers: nextAnswers, choiceIds: nextChoiceIds, retake, index: index + 1 });
  }

  function back() {
    setSaveError(null);
    if (index === 0) {
      router.push(ROUTES.home);
      return;
    }
    setDraft({ status: "ready", answers, choiceIds, retake, index: index - 1 });
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
