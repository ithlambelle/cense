"use client";

import ChevronRight from "@gravity-ui/icons/ChevronRight";
import StarFill from "@gravity-ui/icons/StarFill";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SENSITIVE } from "@/lib/analytics";
import { loadDenialReason, type SavedDenialReason } from "@/lib/api-client/denial-reason";
import { loadPlanSteps, savePlanStep, type PlanStepName } from "@/lib/api-client/plans";
import { loadReminders, reapplyReminderFor } from "@/lib/api-client/reminders";
import { formatIsoDate } from "@/lib/dates";
import { deniedPath, ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";
import { cn } from "@/lib/utils";

// `subtitle` is the row's one line (Flow F frames 477:2563, 477:2609); `body`
// is the detail that opens under it.
type Step = { id: PlanStepName; title: string; subtitle: string; body: string; link?: { href: string; label: string } };

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
    // The frame draws this step done, without a line; this one is ours.
    subtitle: "It lists the reasons, or how to ask for them.",
    body: "The issuer has to send a written notice within 30 days of your completed application. It lists the reasons, or tells you how to ask for them (ask within 60 days).",
  },
  {
    id: "check_reports",
    title: "Check your credit reports",
    subtitle: "Free once a year. Not urgent.",
    body: "Use the official free source. Checking your own reports does not hurt your score.",
    link: { href: "https://www.annualcreditreport.com", label: "AnnualCreditReport.com" },
  },
  {
    id: "pause_applications",
    title: "Pause new applications",
    subtitle: "Hold off. Use a preapproval check first.",
    body: "Hold off for now. Use a preapproval check first when you’re ready.",
  },
  {
    id: "build_credit",
    title: "Build credit another way",
    subtitle: "Secured card, credit-builder loan or authorized user.",
    body: "Compare a secured card, credit-builder loan, or authorized-user option. No “apply now” pressure.",
  },
  {
    id: "reapply",
    title: "Reapply in about 6 months",
    // Replaced by the reminder's state on screen.
    subtitle: "Reminder not set",
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
  const reminderDate = useReminderDate(applicationId);
  // A key per load state, so the stars start again from what was loaded.
  return (
    <DeniedPlanScreen
      key={loaded.status}
      applicationId={applicationId}
      start={start}
      reason={reason}
      reminderDate={reminderDate}
      onRetry={loaded.status === "failed" ? retry : undefined}
    />
  );
}

// The saved denial reason for the reason line, read once. It is extra, so it
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

// This card's reapply reminder date ("Apr 5, 2027"), read once for step 5.
// "unknown" while loading or when the read fails: step 5 then offers to set
// one without claiming it is or is not set.
function useReminderDate(applicationId: string | null): string | null | "unknown" {
  const [date, setDate] = useState<string | null | "unknown">("unknown");
  useEffect(() => {
    if (!applicationId) return;
    let current = true;
    loadReminders()
      .then((result) => {
        if (!current || result.kind !== "ok") return;
        const reminder = reapplyReminderFor(result.reminders, applicationId);
        // A reminder already sent is no longer set for a coming date.
        setDate(reminder && reminder.sentAt === null ? formatIsoDate(reminder.remindOn, "short") : null);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [applicationId]);
  return date;
}

// Exported for the dev gallery, which shows it on sample stars.
// Flow F, F1 and F2 (Figma 477:2563, 477:2609): plain List rows, Divider style.
// Tapping a step's circle marks it done (no "Mark as done" text, no "Up next"
// label, so no step is pushed first). Tapping the row opens its detail. Step 5
// holds the reapply reminder: "Reminder not set" with Set a reminder, or
// "Reminder set for <date>" with Change date. The big reminder button is gone.
export function DeniedPlanScreen({
  applicationId,
  start,
  reason = null,
  reminderDate = null,
  onRetry,
}: {
  applicationId: string | null;
  start: PlanStart;
  reason?: SavedDenialReason | null;
  // Step 5's saved reminder date; "unknown" while it loads or when it cannot be read.
  reminderDate?: string | null | "unknown";
  onRetry?: () => void;
}) {
  const [done, setDone] = useState<ReadonlySet<PlanStepName>>(() => new Set(start.done));
  // Fixed for this load: the screen is keyed on the load state.
  const state: SaveState = start.state;
  const [error, setError] = useState<string | null>(null);
  // Steps whose save is still in flight; each is locked until its answer arrives.
  const [saving, setSaving] = useState<ReadonlySet<PlanStepName>>(new Set());
  // The step whose detail is open, if any.
  const [open, setOpen] = useState<PlanStepName | null>(null);
  const canMark = state !== "loading" && state !== "read-only";
  const line = reason ? reasonLine(reason) : null;

  async function mark(step: PlanStepName, value: boolean) {
    setDone((current) => withStep(current, step, value));
    setError(null);
    if (state !== "saved" || !applicationId) return;
    setSaving((current) => withStep(current, step, true));
    const result = await savePlanStep(applicationId, "denial", step, value);
    setSaving((current) => withStep(current, step, false));
    if (result.kind === "ok") return;
    // Undo only this step, so other saves in flight are not overwritten.
    setDone((current) => withStep(current, step, !value));
    setError(result.kind === "failed" ? result.message : "Sign in again to save your plan.");
  }

  return (
    // No bottom bar: the plan frames draw none.
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={deniedPath("options", applicationId)} backLabel="Denial options" />
        <main className="stagger flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
          <TrackOnMount event="denial_plan_viewed" />
          {/* Breaks before "plan" as the frame does, never at the hyphen. */}
          <h1 className="font-heading text-h1 font-medium text-navy">
            A steady <span className="whitespace-nowrap">five-step</span> plan
          </h1>
          <p className="text-body-m text-indigo-black">One step at a time. No rush.</p>
          {line ? <p className={cn("text-body-s text-indigo-black/70", SENSITIVE)}>{line}</p> : null}
          <p className="text-body-s font-semibold text-violet" aria-live="polite">
            {done.size} of {STEPS.length} done
          </p>
          <ul className="flex flex-col">
            {STEPS.map((step) => {
              const lit = done.has(step.id);
              const expanded = open === step.id;
              const reminder = step.id === "reapply" && !lit;
              const subtitle = reminder
                ? reminderDate === "unknown"
                  ? null
                  : reminderDate
                    ? `Reminder set for ${reminderDate}`
                    : "Reminder not set"
                : step.subtitle;
              return (
                <li key={step.id} className="flex gap-3 border-b border-off-white py-3.5">
                  <StepCircle
                    lit={lit}
                    title={step.title}
                    disabled={!canMark || saving.has(step.id)}
                    onToggle={() => mark(step.id, !lit)}
                  />
                  {lit ? (
                    <p className="min-w-0 flex-1 self-center text-body-m leading-[normal] text-indigo-black/70">
                      {step.title}
                      <span className="sr-only">, done</span>
                    </p>
                  ) : reminder ? (
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                      <p className="text-body-m leading-[normal] font-medium text-indigo-black">{step.title}</p>
                      {subtitle ? <p className="text-body-s leading-[normal] text-indigo-black/70">{subtitle}</p> : null}
                      <Link
                        href={deniedPath("reminder", applicationId)}
                        className="relative text-body-s leading-[normal] font-semibold text-violet underline before:absolute before:-inset-3 before:content-[''] focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {reminderDate && reminderDate !== "unknown" ? "Change date" : "Set a reminder"}
                      </Link>
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : step.id)}
                        className="flex w-full items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                          <span className="text-body-m leading-[normal] font-medium text-indigo-black">{step.title}</span>
                          <span className="text-body-s leading-[normal] text-indigo-black/70">{subtitle}</span>
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          width={16}
                          height={16}
                          className={cn("shrink-0 text-indigo-black transition-transform duration-200", expanded && "rotate-90")}
                        />
                      </button>
                      {expanded ? (
                        <div className="flex flex-col items-start gap-1.5 pr-7">
                          <p className="text-body-s text-indigo-black">{step.body}</p>
                          {step.link ? (
                            <a
                              href={step.link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-body-s text-violet underline focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              {step.link.label}
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {state === "read-only" ? (
            <p role="status" className="rounded-input border border-hairline p-4 text-body-s text-indigo-black">
              We can’t tell which card this plan is for, so steps can’t be saved here.
            </p>
          ) : null}
          {state === "failed" ? (
            <div className="flex flex-col gap-2">
              <ErrorMessage>We couldn’t load your saved plan. Your steps won’t be kept.</ErrorMessage>
              {onRetry ? (
                <Button variant="link" className="self-start text-violet" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        </main>
      </div>
    </div>
  );
}

// The reason line for each saved answer. "Not yet" has no reason to show.
// "Something else" reads "other": the student's own note is not shown as the
// reason (Ben, 2026-10-24).
function reasonLine({ reason }: SavedDenialReason): string | null {
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
      return "Reason: other";
    case "no_letter_yet":
      return null;
  }
}

// The step's circle (List row "Lead / slot" and "Lead / done", 24px): an empty
// ring, or the lit star once done. It is the control that marks the step, with
// a 44px target around it.
function StepCircle({
  lit,
  title,
  disabled,
  onToggle,
}: {
  lit: boolean;
  title: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={lit}
      aria-label={`Done: ${title}`}
      disabled={disabled}
      onClick={onToggle}
      className="relative size-6 shrink-0 rounded-pill before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
    >
      {lit ? (
        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-pill bg-amber">
          <StarFill width={12} height={12} className="animate-pop text-white" />
        </span>
      ) : (
        <span aria-hidden="true" className="block size-6 rounded-pill border-[1.5px] border-indigo-black" />
      )}
    </button>
  );
}
