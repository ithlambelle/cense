"use client";

import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Hourglass from "@gravity-ui/icons/Hourglass";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { Constellation } from "@/components/home/constellation";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { StatusPill } from "@/components/ui/status-pill";
import { SENSITIVE } from "@/lib/analytics";
import { loadPlanSteps, type PlanStepName } from "@/lib/api-client/plans";
import type { Application, ApplicationDetail } from "@/lib/api/application";
import { DENIAL_PLAN_STEPS, denialReasonLine, nextDenialStep } from "@/lib/copy/denial";
import { deniedPath, ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";
import { cn } from "@/lib/utils";

// Home's denied card (Flow 2): the card that was not approved, its reason, the
// denial plan's five stars and the next step in one module (frame 6, Figma
// 144:2248), or "Waiting on the issuer's letter" while the letter has not come
// (A2, 144:2370). No card picture: they did not get the card (C9).

type DenialReason = ApplicationDetail["denialReason"];

function loadDone(applicationId: string) {
  return async (): Promise<LoadOutcome<ReadonlySet<PlanStepName>>> => {
    const result = await loadPlanSteps(applicationId, "denial");
    if (result.kind === "signed-out") return "signed-out";
    if (result.kind === "failed") return { status: "failed", message: result.message };
    return { status: "ready", data: result.done };
  };
}

export function DeniedCard({
  application,
  reason,
  note,
  sampleStars,
}: {
  application: Application;
  // Null when the student has not said why yet.
  reason: DenialReason;
  note: string | null;
  // Dev gallery only: this many steps done, in order, with nothing loaded.
  sampleStars?: number;
}) {
  if (reason === "no_letter_yet") return <WaitingCard application={application} />;
  if (sampleStars !== undefined) {
    const done = new Set(DENIAL_PLAN_STEPS.slice(0, sampleStars).map(({ step }) => step));
    return <PlanCard application={application} reason={reason} note={note} done={done} loadError={null} onRetry={() => {}} />;
  }
  return <SavedPlanCard application={application} reason={reason} note={note} />;
}

function SavedPlanCard({ application, reason, note }: { application: Application; reason: DenialReason; note: string | null }) {
  const load = useMemo(() => loadDone(application.id), [application.id]);
  const { loaded, retry } = useLoaded(load, signInPath(ROUTES.home));
  return (
    <PlanCard
      application={application}
      reason={reason}
      note={note}
      done={loaded.status === "ready" ? loaded.data : null}
      loadError={loaded.status === "failed" ? loaded.message : null}
      onRetry={retry}
    />
  );
}

// The card art, name and pill (144:2261). The art is the frame's faded card,
// never a picture of the card they did not get. The pill stays the designers'
// status pill (Ben, 2026-10-24), not the frame's red status label.
function CardHeader({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="relative h-[38px] w-14 shrink-0 rounded-[6px] bg-indigo-black/15">
        <span className="absolute top-[9px] left-[7px] h-2 w-[11px] rounded-[2px] bg-amber opacity-40" />
        <span className="absolute top-[27px] left-[7px] h-[3px] w-[26px] rounded-[2px] bg-white/35 opacity-40" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <h2 className="font-heading text-h6 font-medium text-navy">{name}</h2>
        <StatusPill className={SENSITIVE}>NOT APPROVED</StatusPill>
      </div>
    </div>
  );
}

function Module({ name, gap, children }: { name: string; gap: string; children: ReactNode }) {
  return (
    <section aria-label={name} className={cn("flex flex-col rounded-card border-[1.5px] border-violet bg-white p-5", gap)}>
      <CardHeader name={name} />
      {children}
    </section>
  );
}

function PlanCard({
  application,
  reason,
  note,
  done,
  loadError,
  onRetry,
}: {
  application: Application;
  reason: DenialReason;
  note: string | null;
  // Null until the saved steps load.
  done: ReadonlySet<PlanStepName> | null;
  loadError: string | null;
  onRetry: () => void;
}) {
  const line = reason ? denialReasonLine(reason, note) : null;
  const next = done ? nextDenialStep(done) : null;
  const planHref = deniedPath("plan", application.id);

  return (
    <Module name={application.cardName} gap="gap-4">
      {line ? (
        // A "Something else" note is the student's own words: never sent to analytics.
        <p className={cn(SENSITIVE, "text-body-s text-indigo-black")}>Reason: {line}</p>
      ) : (
        // No reason saved yet: the denial options ask for it.
        <div className="flex items-baseline gap-2 text-body-s text-indigo-black">
          <p className="flex-1">Reason: not added</p>
          <Link
            href={deniedPath("options", application.id)}
            aria-label="Add the reason"
            className="relative font-medium text-violet underline underline-offset-2 outline-none after:absolute after:-inset-3 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
          >
            Add
          </Link>
        </div>
      )}
      <div className="h-[1.5px] bg-off-white" />
      <h2 className="font-heading text-h6 font-medium text-navy">5-step plan</h2>
      <Constellation count={done?.size ?? 0} layout="five" />

      {done === null ? (
        // Holds the next step's place while the saved steps load.
        loadError ? null : <div aria-hidden="true" className="h-[66px] rounded-input bg-off-white" />
      ) : next ? (
        <Link
          href={planHref}
          className="flex items-center gap-3 rounded-input bg-off-white px-3.5 py-3 text-indigo-black outline-none hover:bg-selected-outline/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true" className="size-6 shrink-0 rounded-pill border-[1.5px] border-indigo-black/70" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-caption leading-4 font-semibold text-violet">NEXT STEP</span>
            <span className="text-body-m font-medium">{next.title}</span>
          </span>
          <ChevronRight aria-hidden="true" width={20} height={20} className="shrink-0 text-violet" />
        </Link>
      ) : null}

      {loadError ? (
        <div className="flex flex-col gap-2">
          <ErrorMessage>{loadError}</ErrorMessage>
          <Button variant="link" className="self-start text-violet" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}

      <Link
        href={planHref}
        className="flex h-11 items-center justify-center rounded-input text-[15px] font-semibold text-violet outline-none hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        See my plan
      </Link>
    </Module>
  );
}

// No letter yet (C11): one line, one action. "I got my letter" goes back to
// the reason question in the denial options.
function WaitingCard({ application }: { application: Application }) {
  return (
    <Module name={application.cardName} gap="gap-3.5">
      <p className="flex items-center gap-2.5 text-body-m font-medium text-indigo-black">
        <Hourglass aria-hidden="true" width={20} height={20} className="shrink-0 text-violet" />
        Waiting on the issuer’s letter
      </p>
      <p className="text-body-s text-indigo-black">When it comes, tell us the reason and we’ll set up your next steps.</p>
      <Link href={deniedPath("options", application.id)} className={cn(buttonVariants(), "justify-between pr-[18px] pl-5")}>
        I got my letter
        <ChevronRight aria-hidden="true" width={16} height={16} />
      </Link>
    </Module>
  );
}
