"use client";

import { useState } from "react";

import { QuizScreen } from "@/components/quiz/quiz-screen";
import { Under18Screen } from "@/components/quiz/under-18-screen";
import { Button } from "@/components/ui/button";
import { ScreenShell } from "@/components/ui/screen-shell";
import { helpText, QUESTIONS, savedChoiceId, withChoice } from "@/lib/quiz/questions";
import type { QuizAnswers } from "@/lib/quiz/questions";

// The six quiz screens running on answers held in memory only. Nothing is
// saved or sent, and no result is computed: that happens on the server.
export function QuizPreview() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [choiceIds, setChoiceIds] = useState<Record<string, string>>({});
  const [under18, setUnder18] = useState(false);

  function restart() {
    setIndex(0);
    setAnswers({});
    setChoiceIds({});
  }

  if (under18) return <Under18Screen onBack={() => setUnder18(false)} />;

  if (index >= QUESTIONS.length) {
    return (
      <ScreenShell footer={<Button variant="secondary" onClick={restart}>Start again</Button>}>
        <h1 className="font-heading text-title font-bold">That’s the last question</h1>
        <p className="mt-2 text-body text-muted-foreground">
          This is a preview of the quiz. Your answers were not saved, and the result screen is not connected yet.
        </p>
      </ScreenShell>
    );
  }

  const question = QUESTIONS[index];

  function select(choiceId: string) {
    const choice = question.choices.find((entry) => entry.id === choiceId);
    if (!choice) return;
    setAnswers(withChoice(answers, choice));
    setChoiceIds({ ...choiceIds, [question.field]: choiceId });
  }

  return (
    <QuizScreen
      question={question}
      step={index + 1}
      total={QUESTIONS.length}
      help={helpText(question, answers)}
      selectedChoiceId={choiceIds[question.field] ?? savedChoiceId(question, answers)}
      onSelect={select}
      onBack={() => setIndex(Math.max(0, index - 1))}
      onContinue={() => {
        const chosen = question.choices.find((entry) => entry.id === choiceIds[question.field]);
        if (chosen?.exit === "under_18") setUnder18(true);
        else setIndex(index + 1);
      }}
    />
  );
}
