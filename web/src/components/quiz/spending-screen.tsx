"use client";

import { useEffect, useId, useRef } from "react";

import { answerCardClass, QuizHeader } from "@/components/quiz/quiz-screen";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { SelectionMark } from "@/components/ui/selection-mark";
import { SENSITIVE } from "@/lib/analytics";
import {
  SPENDING_AMOUNTS,
  SPENDING_CATEGORIES,
  SPENDING_COPY,
  toggleAmount,
  toggleCategory,
  type SpendingAnswer,
  type SpendingOption,
} from "@/lib/quiz/spending";
import { cn } from "@/lib/utils";

type SpendingScreenProps = {
  step: number;
  total: number;
  value: SpendingAnswer;
  onChange: (next: SpendingAnswer) => void;
  // Moves on with or without picks: the question can be skipped.
  onContinue: () => void;
  onBack: () => void;
  onClose: () => void;
  pending?: boolean;
};

// The spending question (Figma 144:2635, values from get_design_context): up to two categories, then one rough
// monthly amount, on one screen. Unlike the other questions a tap only picks,
// so every unpicked card shows the empty ring (G7) and Continue moves on. The
// frame draws no Continue; it is the design system's primary button. Cards
// use the frame's 20px side padding; the six questions still use 18px. See
// lib/quiz/spending.ts for why the answer is not saved yet.
export function SpendingScreen({
  step,
  total,
  value,
  onChange,
  onContinue,
  onBack,
  onClose,
  pending = false,
}: SpendingScreenProps) {
  const titleId = useId();
  const subtitleId = useId();
  const amountId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Announce the new screen, as the other questions do (WCAG 2.4.3).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function card(option: SpendingOption, selected: boolean, onPick: () => void) {
    return (
      <button
        key={option.id}
        type="button"
        aria-pressed={selected}
        disabled={pending}
        onClick={onPick}
        className={cn(answerCardClass, "min-h-14 rounded-[18px] px-5")}
      >
        <span className="flex-1">{option.label}</span>
        <SelectionMark selected={selected} ring />
      </button>
    );
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <main className="flex flex-1 flex-col gap-4 px-6 pt-8 pb-6">
          <QuizHeader step={step} total={total} onBack={onBack} onClose={onClose} pending={pending} />

          <div className="flex animate-fade-up flex-col gap-4">
            <h1
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="font-heading text-h3 font-medium text-navy outline-none"
            >
              {SPENDING_COPY.title}
            </h1>
            <p id={subtitleId} className="text-body-s leading-[normal] text-indigo-black/70">
              {SPENDING_COPY.subtitle}
            </p>
          </div>

          {/* The picks are the student's answers: masked from session replay. */}
          <div
            role="group"
            aria-labelledby={titleId}
            aria-describedby={subtitleId}
            className={cn(SENSITIVE, "stagger flex flex-col gap-4 [--stagger-offset:120ms]")}
          >
            {SPENDING_CATEGORIES.map((option) =>
              card(option, value.categories.includes(option.id), () =>
                onChange({ ...value, categories: toggleCategory(value.categories, option.id) }),
              ),
            )}
          </div>

          <p id={amountId} className="text-body-s leading-[normal] text-indigo-black">
            {SPENDING_COPY.amountLabel}
          </p>
          <div role="group" aria-labelledby={amountId} className={cn(SENSITIVE, "flex flex-col gap-4")}>
            {SPENDING_AMOUNTS.map((option) =>
              card(option, value.amount === option.id, () =>
                onChange({ ...value, amount: toggleAmount(value.amount, option.id) }),
              ),
            )}
          </div>

          <Button className="mt-2" pending={pending} onClick={onContinue}>
            Continue
          </Button>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
