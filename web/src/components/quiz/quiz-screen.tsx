"use client";

import Image from "next/image";
import { useEffect, useId, useRef } from "react";

import { BottomNav } from "@/components/ui/bottom-nav";
import { ErrorMessage } from "@/components/ui/error-message";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SelectedMark } from "@/components/ui/selected-mark";
import { SENSITIVE } from "@/lib/analytics";
import type { Question } from "@/lib/quiz/questions";
import { cn } from "@/lib/utils";

type QuizScreenProps = {
  question: Question;
  // 1 for the first question.
  step: number;
  total: number;
  // The age-specific line for the income question (rules v1.2, Q2), or null.
  help: string | null;
  selectedChoiceId: string | null;
  // Tapping an answer chooses it and moves on; the caller saves and advances.
  onChoose: (choiceId: string) => void;
  onBack: () => void;
  onClose: () => void;
  // True while the answer is being saved. Answers and Back are locked.
  pending?: boolean;
  // Shown under the answers when a save fails.
  error?: string | null;
};

// WCAG 2.2 SC 3.2.2 (On Input): a choice may only move the student on if they
// were told first. https://www.w3.org/WAI/WCAG22/Understanding/on-input.html
export const ADVANCE_HINT = "Tap an answer to go to the next question.";

const control =
  "flex size-12 items-center justify-center rounded-pill outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress";

// One question per screen, from the newest hi-fi frames (397:1208 to 397:906).
// Each answer is a button: choosing it is the action, so arrow keys never move
// the student on by accident (native radios select on arrow keys).
export function QuizScreen({
  question,
  step,
  total,
  help,
  selectedChoiceId,
  onChoose,
  onBack,
  onClose,
  pending = false,
  error = null,
}: QuizScreenProps) {
  const titleId = useId();
  const hintId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // On each new question, move keyboard and screen reader focus to its title
  // (WCAG 2.4.3), so the move to the next question is announced.
  useEffect(() => {
    titleRef.current?.focus();
  }, [question.field]);

  const compact = question.choices.length > 2;

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <main className="flex flex-1 flex-col gap-6 px-6 pt-8 pb-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <button type="button" onClick={onBack} disabled={pending} aria-label="Back" className={control}>
                <Image src="/icons/arrow-left-dark.svg" alt="" width={48} height={48} />
              </button>
              <p className="text-body-s text-indigo-black">
                Question {step} of {total}
              </p>
              <button type="button" onClick={onClose} disabled={pending} aria-label="Close quiz" className={control}>
                <Image src="/icons/xmark-dark.svg" alt="" width={48} height={48} />
              </button>
            </div>
            <ProgressBar current={step} total={total} />
          </div>

          {/* Keyed by question, so each new one fades up in its turn. */}
          <div key={`title-${question.field}`} className="flex animate-fade-up flex-col gap-2">
            <h1
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="font-heading text-h3 font-medium text-navy outline-none"
            >
              {question.title}
            </h1>
            {/* The income help line depends on the age answer. */}
            <p className={cn("text-body-s text-indigo-black/70", help && SENSITIVE)}>
              {help ? `${question.subtitle} ${help}` : question.subtitle}
            </p>
            {step === 1 ? (
              <p id={hintId} className="text-body-s text-indigo-black/70">
                {ADVANCE_HINT}
              </p>
            ) : null}
          </div>

          {/* Answer labels are the student's answers (income, recent denial). */}
          <div
            key={`choices-${question.field}`}
            role="group"
            aria-labelledby={titleId}
            aria-describedby={step === 1 ? hintId : undefined}
            className={cn(
              SENSITIVE,
              "stagger flex flex-col pt-2 [--stagger-offset:120ms]",
              question.choices.length >= 6 ? "gap-5" : "gap-6",
            )}
          >
            {question.choices.map((choice) => {
              const selected = choice.id === selectedChoiceId;
              return (
                <button
                  key={choice.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={pending}
                  onClick={() => onChoose(choice.id)}
                  className={cn(
                    "flex w-full items-center gap-4 border-[1.5px] border-violet bg-white px-[18px] py-3 text-left text-body-m text-navy outline-none transition-[background-color,scale] duration-200 ease-out-soft hover:bg-off-white motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress",
                    compact ? "min-h-14 rounded-[18px]" : "min-h-20 rounded-card",
                    selected && "bg-off-white",
                  )}
                >
                  <span className="flex-1">{choice.label}</span>
                  {selected ? <SelectedMark /> : null}
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="animate-fade-up">
              <ErrorMessage>{error}</ErrorMessage>
            </div>
          ) : null}
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
