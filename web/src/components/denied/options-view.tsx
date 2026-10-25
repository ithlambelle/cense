"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { TrackedLink } from "@/components/analytics/tracked-link";
import { DeniedLayout } from "@/components/denied/denied-layout";
import { Mascot } from "@/components/mascot/mascot";
import { Button } from "@/components/ui/button";
import { choiceRowClass } from "@/components/ui/choice-row";
import { ErrorMessage } from "@/components/ui/error-message";
import { SelectionMark } from "@/components/ui/selection-mark";
import { SENSITIVE, track } from "@/lib/analytics";
import { DENIAL_NOTE_MAX, saveDenialReason, type DenialReason } from "@/lib/api-client/denial-reason";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";
import { deniedPath, ROUTES, signInPath, type DeniedStep } from "@/lib/routes";

// The four reasons on "Was it one of these?" (Figma 144:2002, C6), saved as
// the application's denialReason. report_frozen has no choice.
const REASONS = [
  { value: "no_credit_history", label: "Not enough credit history" },
  { value: "income", label: "Not enough income" },
  { value: "could_not_verify", label: "Couldn’t verify my identity" },
  { value: "something_else", label: "Something else" },
] as const satisfies readonly { value: DenialReason; label: string }[];

type Reason = (typeof REASONS)[number]["value"];
// Which answer is saving or failed: the reason's Continue, or "Not yet".
type Answer = "reason" | "no-letter";

// Only the dev gallery sets this, to show the reason step mid-save or failed
// without calling the API.
export type OptionsPreview = { reason: Reason; note?: string; saving?: Answer; error?: { answer: Answer; message: string } };

// Denial options (Figma 144:1955, C5) and the reason reveal on the same page
// (144:2002, C6). Issuers have up to 30 days to send the letter (Regulation B,
// 12 CFR 1002.9(a)(1)), so the first question asks whether they know the reason
// yet. Continue saves the reason (PATCH /applications/{id}) and then opens the
// plan; "Not yet" saves no_letter_yet and opens "No problem" (A1, 144:2322).
// Nothing moves on until the save answers, so no screen claims a save that
// failed. The note must never reach analytics or a URL.
export function DeniedOptionsView({ applicationId, preview }: { applicationId: string | null; preview?: OptionsPreview }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [knowsReason, setKnowsReason] = useState(preview !== undefined);
  const [reason, setReason] = useState<Reason | null>(preview?.reason ?? null);
  const [note, setNote] = useState(preview?.note ?? "");
  const [saving, setSaving] = useState<Answer | null>(preview?.saving ?? null);
  const [error, setError] = useState<{ answer: Answer; message: string } | null>(preview?.error ?? null);
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

  // Saves the answer, then opens the next screen. Without a card there is
  // nothing to save against, so it only moves on (that screen says so).
  async function saveThenOpen(answer: Answer, value: DenialReason, next: DeniedStep) {
    if (saving) return;
    setError(null);
    if (applicationId) {
      setSaving(answer);
      const result = await saveDenialReason(applicationId, value, note);
      // The student left while it saved: the answer must not move them again.
      if (!isMounted()) return;
      setSaving(null);
      if (result.kind === "signed-out") {
        router.replace(signInPath(ROUTES.home));
        return;
      }
      if (result.kind === "failed") {
        setError({ answer, message: result.message });
        return;
      }
      // Home shows the reason from its server render: refresh it, or Back
      // restores the cached Home saying "not added".
      router.refresh();
    }
    if (answer === "no-letter") track("denial_letter_answered", { answer: "waiting_on_letter" });
    router.push(deniedPath(next, applicationId));
  }

  function chooseKnowsReason() {
    if (saving) return;
    setError(null);
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
        <Mascot pose="sad" size={190} priority />
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
                <button
                  type="button"
                  aria-busy={saving === "no-letter"}
                  disabled={saving !== null}
                  onClick={() => void saveThenOpen("no-letter", "no_letter_yet", "noLetter")}
                  className={cn(choiceRowClass, "justify-between gap-4 text-left disabled:cursor-progress disabled:opacity-60")}
                >
                  Not yet, I’m waiting on the letter
                  {saving === "no-letter" ? <Saving /> : null}
                </button>
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
        {error?.answer === "no-letter" ? <ErrorMessage>{error.message}</ErrorMessage> : null}
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
                  disabled={saving !== null}
                  onClick={() => {
                    setReason(option.value);
                    setError(null);
                  }}
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
                maxLength={DENIAL_NOTE_MAX}
                disabled={saving !== null}
                placeholder="Too many recent applications"
                onChange={(event) => setNote(event.target.value)}
                className={cn(
                  "h-20 resize-none rounded-input border-[1.5px] border-violet bg-white px-4 py-3.5 text-body-m text-navy caret-violet outline-none placeholder:text-indigo-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  SENSITIVE,
                )}
              />
            </div>
          ) : null}
          {error?.answer === "reason" ? <ErrorMessage>{error.message}</ErrorMessage> : null}
          <Button
            pending={saving === "reason"}
            disabled={!reason}
            onClick={() => {
              if (reason) void saveThenOpen("reason", reason, "plan");
            }}
          >
            Continue
          </Button>
        </section>
      ) : null}
    </DeniedLayout>
  );
}

// The small spinner the shared Button shows while saving, for the answer row.
function Saving() {
  return (
    <span role="status" className="flex items-center">
      <span aria-hidden="true" className="size-4 rounded-full border-2 border-violet border-r-transparent motion-safe:animate-spin" />
      <span className="sr-only">Saving</span>
    </span>
  );
}
