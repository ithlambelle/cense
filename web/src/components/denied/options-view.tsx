"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { TrackedLink } from "@/components/analytics/tracked-link";
import { DeniedLayout } from "@/components/denied/denied-layout";
import { Button } from "@/components/ui/button";
import { choiceRowClass } from "@/components/ui/choice-row";
import { SelectionMark } from "@/components/ui/selection-mark";
import { SENSITIVE, track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { deniedPath, ROUTES } from "@/lib/routes";

// The four reasons on "Was it one of these?" (Figma 144:2002, C6). The values
// match card_applications.denial_reason on main; report_frozen has no choice.
const REASONS = [
  { value: "no_credit_history", label: "Not enough credit history" },
  { value: "income", label: "Not enough income" },
  { value: "could_not_verify", label: "Couldn’t verify my identity" },
  { value: "something_else", label: "Something else" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

// Denial options (Figma 144:1955, C5) and the reason reveal on the same page
// (144:2002, C6). Issuers have up to 30 days to send the letter (Regulation B,
// 12 CFR 1002.9(a)(1)), so the first question asks whether they know the reason
// yet. "Not yet" will open the "No problem" screen (A1, 144:2322) once it is
// built; until then it goes to the plan, as before.
//
// NOT SAVED YET: the API does not expose denial_reason (PATCH
// /applications/{id} takes only status and creditLimitCents), so the reason and
// the "Something else" note live in this page's state only and are dropped on
// Continue. Nothing here claims a save. The note must never reach analytics or
// a URL. Wire the save here when the contract gains denialReason.
export function DeniedOptionsView({ applicationId }: { applicationId: string | null }) {
  const router = useRouter();
  const [knowsReason, setKnowsReason] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const questionRef = useRef<HTMLElement>(null);
  const reasonHeadingRef = useRef<HTMLHeadingElement>(null);
  const noteId = useId();

  // C6: scroll to the new question and move focus to it; reduce motion jumps.
  useEffect(() => {
    if (!knowsReason) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    questionRef.current?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    reasonHeadingRef.current?.focus({ preventScroll: true });
  }, [knowsReason]);

  function chooseKnowsReason() {
    if (knowsReason) {
      // Tapping the chosen answer again reopens the three answers.
      setKnowsReason(false);
      setReason(null);
      setNote("");
      return;
    }
    track("denial_letter_answered", { answer: "knows_reason" });
    setKnowsReason(true);
  }

  return (
    <DeniedLayout backHref={ROUTES.home} backLabel="Home" contentClassName="gap-4">
      <h1 className="text-center font-heading text-h1 font-medium text-navy">Denial options</h1>
      <div className="flex justify-center">
        <Image src="/mascot/penny.png" alt="" width={190} height={190} priority />
      </div>
      <p className="text-body-m text-indigo-black">
        A common reason first applications are denied is that lenders can’t see enough history yet. We’ll help you check the
        reason before you do anything else.
      </p>
      <section ref={questionRef} aria-labelledby="letter-question" className="flex scroll-mt-20 flex-col gap-4">
        <h2 id="letter-question" className="font-heading text-h5 font-medium text-navy">
          Did the issuer tell you why?
        </h2>
        <ul className="flex flex-col gap-4">
          <li>
            <button
              type="button"
              aria-pressed={knowsReason}
              onClick={chooseKnowsReason}
              className={cn(choiceRowClass, "justify-between gap-4 text-left")}
            >
              Yes, I know the reason
              <SelectionMark selected={knowsReason} />
            </button>
          </li>
          {knowsReason ? null : (
            <>
              <li>
                <TrackedLink
                  href={deniedPath("plan", applicationId)}
                  className={choiceRowClass}
                  track={{ event: "denial_letter_answered", props: { answer: "waiting_on_letter" } }}
                >
                  Not yet, I’m waiting on the letter
                </TrackedLink>
              </li>
              <li>
                <TrackedLink
                  href={deniedPath("fixable", applicationId)}
                  className={choiceRowClass}
                  track={{ event: "denial_letter_answered", props: { answer: "thinks_mistake" } }}
                >
                  I think it was a mistake
                </TrackedLink>
              </li>
            </>
          )}
        </ul>
      </section>

      {knowsReason ? (
        <section aria-labelledby="reason-question" className="flex flex-col gap-4">
          <div aria-hidden="true" className="h-[1.5px] bg-off-white" />
          <h2
            id="reason-question"
            ref={reasonHeadingRef}
            tabIndex={-1}
            className="font-heading text-h5 font-medium text-navy outline-none"
          >
            Was it one of these?
          </h2>
          <ul className="flex flex-col gap-4">
            {REASONS.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  aria-pressed={reason === option.value}
                  onClick={() => setReason(option.value)}
                  className={cn(choiceRowClass, "justify-between gap-4 text-left", SENSITIVE)}
                >
                  {option.label}
                  <SelectionMark selected={reason === option.value} />
                </button>
              </li>
            ))}
          </ul>
          {reason === "something_else" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={noteId} className="text-body-s font-medium text-indigo-black">
                What did the letter say?
              </label>
              <textarea
                id={noteId}
                value={note}
                maxLength={200}
                placeholder="Too many recent applications"
                onChange={(event) => setNote(event.target.value)}
                className={cn(
                  "h-20 resize-none rounded-input border-[1.5px] border-violet bg-white px-4 py-3.5 text-body-m text-navy caret-violet outline-none placeholder:text-indigo-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  SENSITIVE,
                )}
              />
            </div>
          ) : null}
          <Button disabled={!reason} onClick={() => router.push(deniedPath("plan", applicationId))}>
            Continue
          </Button>
        </section>
      ) : null}
    </DeniedLayout>
  );
}
