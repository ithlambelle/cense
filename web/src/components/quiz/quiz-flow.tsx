"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { QuizScreen } from "@/components/quiz/quiz-screen";
import { Under18Screen } from "@/components/quiz/under-18-screen";
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
  | { status: "ready"; answers: QuizAnswers; index: number; choiceIds: Record<string, string> };

// Reads the saved draft. Returns "signed-out" when the session has ended.
async function fetchDraft(): Promise<Draft | "signed-out"> {
  const result = await apiRequest("get", "/quiz");
  if (result.ok) {
    const answers = result.data.answers;
    return { status: "ready", answers, index: firstUnanswered(answers) ?? 0, choiceIds: {} };
  }
  if (isUnauthorized(result)) return "signed-out";
  // 404 means no saved quiz yet: start at the first question.
  if (result.kind === "api" && result.status === 404) {
    return { status: "ready", answers: {}, index: 0, choiceIds: {} };
  }
  return { status: "failed", message: failureMessage(result) };
}

// The quiz against the API. Answers are saved on each Continue and kept in
// memory only: never in the address bar, a cookie or browser storage.
export function QuizFlow() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [under18, setUnder18] = useState(false);

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

  if (under18) return <Under18Screen onBack={() => setUnder18(false)} />;

  const { answers, index, choiceIds } = draft;
  const question = QUESTIONS[index];
  const isLast = index === QUESTIONS.length - 1;

  function select(choiceId: string) {
    const choice = question.choices.find((entry) => entry.id === choiceId);
    if (!choice) return;
    setSaveError(null);
    setDraft({
      status: "ready",
      index,
      answers: withChoice(answers, choice),
      choiceIds: { ...choiceIds, [question.field]: choiceId },
    });
  }

  async function saveAndContinue() {
    const chosen = question.choices.find((entry) => entry.id === choiceIds[question.field]);
    if (chosen?.exit === "under_18") {
      setUnder18(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    // The API replaces the whole answers object, so the full draft is sent.
    const result = await apiRequest("put", "/quiz", { body: { answers } });
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
      // Stays pending while the results screen loads.
      router.push(ROUTES.results);
      return;
    }
    setSaving(false);
    setDraft({ status: "ready", answers, choiceIds, index: index + 1 });
  }

  function back() {
    setSaveError(null);
    if (index === 0) {
      router.push(ROUTES.cards);
      return;
    }
    setDraft({ status: "ready", answers, choiceIds, index: index - 1 });
  }

  return (
    <QuizScreen
      question={question}
      step={index + 1}
      total={QUESTIONS.length}
      help={helpText(question, answers)}
      selectedChoiceId={choiceIds[question.field] ?? savedChoiceId(question, answers)}
      onSelect={select}
      onBack={back}
      onContinue={saveAndContinue}
      pending={saving}
      error={saveError}
    />
  );
}
