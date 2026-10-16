"use client";

import { useEffect, useId, useRef } from "react";

import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { OptionGroup } from "@/components/ui/option-group";
import { ProgressSegments, progressLabel } from "@/components/ui/progress-segments";
import { ScreenShell } from "@/components/ui/screen-shell";
import type { Question } from "@/lib/quiz/questions";

type QuizScreenProps = {
  question: Question;
  // 1 for the first question.
  step: number;
  total: number;
  help: string | null;
  selectedChoiceId: string | null;
  onSelect: (choiceId: string) => void;
  onBack: () => void;
  onContinue: () => void;
  // True while the answer is being saved.
  pending?: boolean;
  // Shown above Continue when a save fails.
  error?: string | null;
};

// One question per screen. Shows what it is given and reports what the
// student does; where answers are kept is the caller's business.
export function QuizScreen({
  question,
  step,
  total,
  help,
  selectedChoiceId,
  onSelect,
  onBack,
  onContinue,
  pending = false,
  error = null,
}: QuizScreenProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // On each new question, move keyboard and screen reader focus to it.
  useEffect(() => {
    titleRef.current?.focus();
  }, [question.field]);

  const options = question.choices.map((choice) => ({ value: choice.id, label: choice.label }));

  return (
    <ScreenShell
      footer={
        <>
          {error ? (
            <p role="alert" className="text-center text-label text-destructive">
              {error}
            </p>
          ) : null}
          <Button disabled={selectedChoiceId === null} pending={pending} onClick={onContinue}>
            Continue
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-between">
        <BackLink onClick={onBack} disabled={pending} />
        <p className="text-label text-muted-foreground">{progressLabel(step, total)}</p>
      </div>
      <div className="mt-4">
        <ProgressSegments current={step} total={total} />
      </div>
      <h1 id={titleId} ref={titleRef} tabIndex={-1} className="mt-6 font-heading text-title font-bold outline-none">
        {question.title}
      </h1>
      {help ? <p className="mt-2 text-label text-muted-foreground">{help}</p> : null}
      <div className="mt-8">
        <OptionGroup
          key={question.field}
          labelledBy={titleId}
          options={options}
          value={selectedChoiceId}
          onChange={onSelect}
          density={options.length > 2 ? "compact" : "roomy"}
          disabled={pending}
        />
      </div>
    </ScreenShell>
  );
}
