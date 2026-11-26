"use client";

// Created with Claude Code (2026-11-26). Home's one next step (Demo Day step
// 9), the first priority rule that applies (lib/home/next-step.ts). Built on
// Flow 1 N1 (Figma 821:8595) as a Home card rather than a full screen: the
// "YOUR NEXT STEP" eyebrow, the title, the Info callout "Why this step first"
// (Neutral, 371:3444), one primary button, and the flowchart the order comes
// from credited underneath (not on Link your bank, which comes before it).

import Link from "next/link";
import { useEffect, useId } from "react";

import { InfoCallout } from "@/components/setup/setup-parts";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { SENSITIVE, track } from "@/lib/analytics";
import { NEXT_STEP_CARD_COPY } from "@/lib/home/copy";
import type { NextStep } from "@/lib/home/next-step";

export function NextStepCard({ step }: { step: NextStep }) {
  const titleId = useId();
  // Counted each time Home shows a step, so a change after the student acts is seen.
  useEffect(() => {
    track("next_step_viewed", { step: step.id });
  }, [step.id]);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-card border border-hairline bg-white p-5">
      <div className="flex flex-col gap-2">
        {/* Inter Semi Bold 13, Amethyst, in capitals as drawn (821:8606). */}
        <p className="text-[13px] leading-[normal] font-semibold text-violet uppercase">{NEXT_STEP_CARD_COPY.eyebrow}</p>
        <h2 id={titleId} className="font-heading text-h3 font-medium text-navy">
          {step.title}
        </h2>
      </div>
      {/* The why line can carry the student's own amounts, card or goal name:
          masked in session replay. */}
      <div className={SENSITIVE}>
        <InfoCallout title={NEXT_STEP_CARD_COPY.whyTitle}>{step.why}</InfoCallout>
      </div>
      <Link href={step.action.href} onClick={() => track("next_step_clicked", { step: step.id })} className={buttonVariants()}>
        {step.action.label}
        <ButtonChevron />
      </Link>
      {/* The flowchart starts from a known budget, so linking a bank is not one of its steps. */}
      {step.id !== "link_bank" ? <p className="text-center text-body-s text-indigo-black/70">{NEXT_STEP_CARD_COPY.credit}</p> : null}
    </section>
  );
}
