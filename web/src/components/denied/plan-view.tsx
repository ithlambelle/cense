"use client";

import ChevronRight from "@gravity-ui/icons/ChevronRight";
import FileText from "@gravity-ui/icons/FileText";
import StarFill from "@gravity-ui/icons/StarFill";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { AppHeader } from "@/components/ui/app-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SENSITIVE } from "@/lib/analytics";
import { loadDenialReason, type SavedDenialReason } from "@/lib/api-client/denial-reason";
import { loadPlanSteps, savePlanStep, type PlanStepName } from "@/lib/api-client/plans";
import { deniedPath, ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";
import { cn } from "@/lib/utils";

type Step = { id: PlanStepName; title: string; body: string; link?: { href: string; label: string } };

// From Figma 144:2062 (Flow 2 frame 3). Collapsed steps hide their body in the
// frame (144:2087, 2094, 2105, 2110); it shows when a step is opened.
// Step 1 keeps its reworded body: the frame says "Review the reason and
// instructions within 30 days", which reads as a deadline for the student.
// The 30 days is the issuer's and runs from a completed application, and the
// notice may give the reasons or the right to ask for them within 60 days:
// Regulation B, 12 CFR 1002.9(a)(1)(i) and (a)(2)
// (https://www.consumerfinance.gov/rules-policy/regulations/1002/9/). Step 2:
// AnnualCreditReport.com is the official free source and checking your own
// report does not hurt your score (CFPB,
// https://www.consumerfinance.gov/ask-cfpb/does-requesting-my-credit-report-hurt-my-credit-score-en-1229/).
const STEPS: Step[] = [
  {
    id: "read_letter",
    title: "Read the issuer’s letter",
    body: "The issuer has to send a written notice within 30 days of your completed application. It lists the reasons, or tells you how to ask for them (ask within 60 days).",
  },
  {
    id: "check_reports",
    title: "Check all three credit reports",
    body: "Use the official free source. Checking your own reports does not hurt your score.",
    link: { href: "https://www.annualcreditreport.com", label: "AnnualCreditReport.com" },
  },
  { id: "pause_applications", title: "Pause new applications", body: "Hold off for now. Use a preapproval check first when you’re ready." },
  {
    id: "build_credit",
    title: "Build credit another way",
    body: "Compare a secured card, credit-builder loan, or authorized-user option. No “apply now” pressure.",
  },
  {
    id: "reapply",
    title: "Reapply in about 6 months",
    // A rule of thumb, not an issuer rule: no primary source sets a waiting period.
    body: "Give positive history time to appear, then check preapproval before applying.",
  },
];

// "read-only": no application id, so there is nothing to save stars against.
type SaveState = "loading" | "saved" | "failed" | "read-only";
export type PlanStart = { done: readonly PlanStepName[]; state: SaveState };

function withStep(steps: ReadonlySet<PlanStepName>, step: PlanStepName, on: boolean): ReadonlySet<PlanStepName> {
  const next = new Set(steps);
  if (on) next.add(step);
  else next.delete(step);
  return next;
}

function loadPlan(applicationId: string) {
  return async (): Promise<LoadOutcome<PlanStart>> => {
    const result = await loadPlanSteps(applicationId, "denial");
    if (result.kind === "ok") return { status: "ready", data: { done: [...result.done], state: "saved" } };
    if (result.kind === "signed-out") return "signed-out";
    return { status: "failed", message: result.message };
  };
}

// A steady five-step plan (S22): one star lights for each finished step, saved
// as denial plan steps. The reason note (144:2070) shows the saved denial reason.
export function DeniedPlanView({ applicationId }: { applicationId: string | null }) {
  if (!applicationId) return <DeniedPlanScreen applicationId={null} start={{ done: [], state: "read-only" }} />;
  return <SavedPlan applicationId={applicationId} />;
}

function SavedPlan({ applicationId }: { applicationId: string }) {
  // useLoaded needs a load with one identity per application.
  const load = useMemo(() => loadPlan(applicationId), [applicationId]);
  // The return-path allow-list does not include this page, so Home it is.
  const { loaded, retry } = useLoaded(load, signInPath(ROUTES.home));
  const start: PlanStart = loaded.status === "ready" ? loaded.data : { done: [], state: loaded.status };
  const reason = useDenialReason(applicationId);
  // A key per load state, so the stars start again from what was loaded.
  return (
    <DeniedPlanScreen
      key={loaded.status}
      applicationId={applicationId}
      start={start}
      reason={reason}
      onRetry={loaded.status === "failed" ? retry : undefined}
    />
  );
}

// The saved denial reason for the note, read once. The note is extra, so it
// stays hidden while loading or when the read fails; the plan works without it.
function useDenialReason(applicationId: string): SavedDenialReason | null {
  const [reason, setReason] = useState<SavedDenialReason | null>(null);
  useEffect(() => {
    let current = true;
    loadDenialReason(applicationId)
      .then((saved) => {
        if (current) setReason(saved);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [applicationId]);
  return reason;
}

// Exported for the dev gallery, which shows it on sample stars.
export function DeniedPlanScreen({
  applicationId,
  start,
  reason = null,
  onRetry,
}: {
  applicationId: string | null;
  start: PlanStart;
  reason?: SavedDenialReason | null;
  onRetry?: () => void;
}) {
  const [done, setDone] = useState<ReadonlySet<PlanStepName>>(() => new Set(start.done));
  // Fixed for this load: the screen is keyed on the load state.
  const state: SaveState = start.state;
  const [error, setError] = useState<string | null>(null);
  // Steps whose save is still in flight; each is locked until its answer arrives.
  const [saving, setSaving] = useState<ReadonlySet<PlanStepName>>(new Set());
  const firstOpen = (lit: ReadonlySet<PlanStepName>) => STEPS.find((step) => !lit.has(step.id))?.id ?? null;
  const upNext = firstOpen(done);
  // One step is open at a time, Up next to start with.
  const [open, setOpen] = useState<PlanStepName | null>(upNext);
  const canMark = state !== "loading" && state !== "read-only";

  async function mark(step: PlanStepName, value: boolean) {
    setDone((current) => withStep(current, step, value));
    setError(null);
    if (value) setOpen(firstOpen(withStep(done, step, true)));
    if (state !== "saved" || !applicationId) return;
    setSaving((current) => withStep(current, step, true));
    const result = await savePlanStep(applicationId, "denial", step, value);
    setSaving((current) => withStep(current, step, false));
    if (result.kind === "ok") return;
    // Undo only this step, so other saves in flight are not overwritten.
    setDone((current) => withStep(current, step, !value));
    setOpen(step);
    setError(result.kind === "failed" ? result.message : "Sign in again to save your plan.");
  }

  return (
    // DeniedLayout without its bottom bar: frame 144:2062 draws none.
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={deniedPath("options", applicationId)} backLabel="Denial options" />
        <main className="stagger flex flex-1 flex-col gap-[18px] px-6 pt-4 pb-6">
          <TrackOnMount event="denial_plan_viewed" />
          <div className="flex flex-col gap-2">
            {/* Breaks after "steady" as the frame does, never at the hyphen. */}
            <h1 className="font-heading text-h1 font-semibold text-navy">
              A steady <span className="whitespace-nowrap">five-step plan</span>
            </h1>
            <p className="text-body-m text-indigo-black">One step at a time. No rush.</p>
          </div>
          {reason ? <ReasonNote reason={reason} /> : null}
          <p className="flex items-center gap-2 text-body-s font-medium text-indigo-black" aria-live="polite">
            <StarFill aria-hidden="true" width={16} height={16} className="shrink-0 text-amber" />
            {done.size} of {STEPS.length} done
          </p>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-[4px] bg-off-white">
            <div
              className="h-full rounded-[4px] bg-amber transition-[width] duration-500 ease-out-soft motion-reduce:transition-none"
              style={{ width: `${(done.size / STEPS.length) * 100}%` }}
            />
          </div>
          {/* Figma strokes sit inside the box: padding is 20 by 6 less the 1.5 border, and
              row dividers are inset shadows, so rows keep the frame's 54px. */}
          <ul className="flex flex-col rounded-card border-[1.5px] border-violet bg-white px-[18.5px] py-[4.5px]">
            {STEPS.map((step) => {
              const lit = done.has(step.id);
              const title = (
                <>
                  {step.title}
                  {lit ? <span className="sr-only">, done</span> : null}
                </>
              );
              const titleClass = cn("font-heading text-h6 font-medium", lit ? "text-indigo-black/70" : "text-indigo-black");
              return (
                <li key={step.id} className="not-last:shadow-[inset_0_-1px_0_var(--color-off-white)]">
                  {open === step.id ? (
                    <div className="flex items-start gap-2.5 py-3.5">
                      <StarSlot lit={lit} />
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-indigo-black">
                        {step.id === upNext ? <p className="text-[11px] leading-[13px] font-semibold text-violet">UP NEXT</p> : null}
                        <p className={titleClass}>{title}</p>
                        <p className="text-body-s">{step.body}</p>
                        {step.link ? (
                          <a
                            href={step.link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-body-s text-violet underline outline-none focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {step.link.label}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        ) : null}
                        {canMark ? (
                          <button
                            type="button"
                            disabled={saving.has(step.id)}
                            onClick={() => mark(step.id, !lit)}
                            className="relative text-body-s leading-[17px] font-semibold text-violet underline outline-none before:absolute before:-inset-3 before:content-[''] focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60"
                          >
                            {lit ? "Mark as not done" : "Mark as done"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={false}
                      onClick={() => setOpen(step.id)}
                      className="flex w-full items-center gap-2.5 py-3.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <StarSlot lit={lit} />
                      <span className={cn("min-w-0 flex-1", titleClass)}>{title}</span>
                      <ChevronRight aria-hidden="true" width={14} height={14} className="shrink-0 text-indigo-black" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {state === "read-only" ? (
            <p role="status" className="rounded-input border border-hairline p-4 text-body-s text-indigo-black">
              We can’t tell which card this plan is for, so stars can’t be saved here.
            </p>
          ) : null}
          {state === "failed" ? (
            <div className="flex flex-col gap-2">
              <ErrorMessage>We couldn’t load your saved plan. Your stars won’t be kept.</ErrorMessage>
              {onRetry ? (
                <Button variant="link" className="self-start text-violet" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          <div className="flex flex-col gap-2">
            <Link href={deniedPath("reminder", applicationId)} className={buttonVariants()}>
              Set a 6-month reminder
            </Link>
            <p className="text-center text-body-s text-indigo-black">Only saves a reapply reminder.</p>
          </div>
        </main>
      </div>
    </div>
  );
}

// The reason line for each saved answer. "Not yet" has no reason to show.
function reasonLine({ reason, note }: SavedDenialReason): string | null {
  switch (reason) {
    case "no_credit_history":
      return "Reason: no credit history yet";
    case "income":
      return "Reason: not enough income";
    case "could_not_verify":
      return "Reason: couldn’t verify identity";
    case "report_frozen":
      return "Reason: credit report frozen";
    case "something_else":
      return note ? `Reason: ${note}` : "Reason: something else";
    case "no_letter_yet":
      return null;
  }
}

// Behind "Why?". Only no credit history has one: the frame draws it for that
// reason alone (the old "No credit file" notice, C5 to C7).
const WHY: Partial<Record<SavedDenialReason["reason"], string>> = {
  no_credit_history:
    "It usually means the credit bureau doesn’t have a record for you yet. That’s common for students and isn’t a mark against you.",
};

// Frame 144:2070, in Lavender (off-white) rather than the frame's light blue
// tint, which design is moving away from.
function ReasonNote({ reason }: { reason: SavedDenialReason }) {
  const [open, setOpen] = useState(false);
  const whyId = useId();
  const line = reasonLine(reason);
  if (!line) return null;
  const why = WHY[reason.reason];
  return (
    <section aria-label="Denial reason" className="flex flex-col gap-1 rounded-input bg-off-white px-4 py-3 text-indigo-black">
      <div className="flex items-center gap-3">
        <FileText aria-hidden="true" width={22} height={22} className="shrink-0 text-violet" />
        <p className={cn("min-w-0 flex-1 font-heading text-body-s leading-[22px] font-semibold break-words", SENSITIVE)}>{line}</p>
        {why ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={whyId}
            onClick={() => setOpen(!open)}
            className="relative shrink-0 text-body-s font-semibold text-violet underline outline-none before:absolute before:-inset-3 before:content-[''] focus-visible:outline-2 focus-visible:outline-ring"
          >
            Why?
          </button>
        ) : null}
      </div>
      {why && open ? (
        <p id={whyId} className="pl-[34px] text-body-s">
          {why}
        </p>
      ) : null}
    </section>
  );
}

// Figma "Star slot / lit" (144:2082) and "Star slot / empty" (144:2097).
function StarSlot({ lit }: { lit: boolean }) {
  return lit ? (
    <span aria-hidden="true" className="flex size-[26px] shrink-0 items-center justify-center rounded-pill bg-amber">
      <StarFill width={12} height={12} className="animate-pop text-white" />
    </span>
  ) : (
    <span aria-hidden="true" className="size-[26px] shrink-0 rounded-pill border-[1.5px] border-indigo-black/70" />
  );
}
