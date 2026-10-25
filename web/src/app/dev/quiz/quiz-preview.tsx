"use client";

import { useState } from "react";

import { QuizScreen } from "@/components/quiz/quiz-screen";
import { SpendingScreen } from "@/components/quiz/spending-screen";
import { Button } from "@/components/ui/button";
import { helpText, QUESTIONS, savedChoiceId, withChoice } from "@/lib/quiz/questions";
import type { QuizAnswers } from "@/lib/quiz/questions";
import { NO_SPENDING, QUIZ_STEP_COUNT, type SpendingAnswer } from "@/lib/quiz/spending";

// The six quiz questions and the spending question, running on answers held
// in memory only. Nothing is saved or sent, and no result is computed: that
// happens on the server.
export function QuizPreview() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [choiceIds, setChoiceIds] = useState<Record<string, string>>({});
  const [spending, setSpending] = useState<SpendingAnswer>(NO_SPENDING);

  function restart() {
    setIndex(0);
    setAnswers({});
    setChoiceIds({});
    setSpending(NO_SPENDING);
  }

  if (index > QUESTIONS.length) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-phone flex-col gap-4 px-6 pt-8 pb-6">
        <h1 className="font-heading text-h3 font-medium text-navy">That’s the last question</h1>
        <p className="text-body-m text-indigo-black">This is a preview of the quiz. Your answers were not saved.</p>
        <Button variant="secondary" onClick={restart}>
          Start again
        </Button>
      </main>
    );
  }

  if (index === QUESTIONS.length) {
    return (
      <SpendingScreen
        step={index + 1}
        total={QUIZ_STEP_COUNT}
        value={spending}
        onChange={setSpending}
        onContinue={() => setIndex(index + 1)}
        onBack={() => setIndex(index - 1)}
        onClose={restart}
      />
    );
  }

  const question = QUESTIONS[index];

  return (
    <QuizScreen
      question={question}
      step={index + 1}
      total={QUIZ_STEP_COUNT}
      help={helpText(question, answers)}
      selectedChoiceId={choiceIds[question.field] ?? savedChoiceId(question, answers)}
      onChoose={(choiceId) => {
        const choice = question.choices.find((entry) => entry.id === choiceId);
        if (!choice) return;
        setAnswers(withChoice(answers, choice));
        setChoiceIds({ ...choiceIds, [question.field]: choiceId });
        setIndex(index + 1);
      }}
      onBack={() => setIndex(Math.max(0, index - 1))}
      onClose={restart}
    />
  );
}
