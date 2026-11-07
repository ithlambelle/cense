"use client";

import Check from "@gravity-ui/icons/Check";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { SENSITIVE } from "@/lib/analytics";
import { saveAutopay } from "@/lib/api-client/applications";
import { loadPlanSteps, savePlanStep, type PlanStepName } from "@/lib/api-client/plans";
import type { Application } from "@/lib/api/application";
import { moneyAmount } from "@/lib/money";
import { SPEND_LIMIT_PERCENT, SPEND_LIMIT_SOURCE, suggestedSpendLimitCents } from "@/lib/plan/spend-limit";
import { paymentRemindersPath, ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";
import { cn } from "@/lib/utils";

type ActionKey = "autopay" | "plannedPurchase" | "paymentReminder";
type PlanActions = Record<ActionKey, boolean>;

// The saved step behind each action. Autopay is not a plan step: it is the
// card's own autopay status (US-10), read on the server with the card and
// saved with PATCH /applications/{id}, as on Home, so both agree.
const STEP: Record<ActionKey, PlanStepName | null> = {
  autopay: null,
  plannedPurchase: "planned_purchase",
  paymentReminder: "payment_reminder",
};

const ACTIONS: { key: ActionKey; title: string; detail: string }[] = [
  { key: "autopay", title: "Turn on autopay", detail: "Set autopay for at least the minimum payment, or the full statement balance if your bank account can always cover it." },
  { key: "plannedPurchase", title: "Choose one planned purchase", detail: "Pick a small expense you already budget for and can pay off in full." },
  { key: "paymentReminder", title: "Set a payment reminder", detail: "Use the due date on your card statement." },
];

const ACTION_ROW =
  "flex w-full items-start gap-3 rounded-input border-[1.5px] border-violet bg-white p-4 text-left hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const NONE_DONE: PlanActions = { autopay: false, plannedPurchase: false, paymentReminder: false };

type SaveState = "loading" | "saved" | "failed";

type SavedPlan = { actions: PlanActions; state: "saved" };

// The reminder action opens the reminder screen, which saves the card's days and
// then the step; a step without a reminder that is really on (saved days, the
// due-date email on, emails not off) is not done.
function loadPlan(applicationId: string, reminderOn: boolean, autopayOn: boolean) {
  return async (): Promise<LoadOutcome<SavedPlan>> => {
    const result = await loadPlanSteps(applicationId, "first_month");
    if (result.kind === "ok") {
      return {
        status: "ready",
        data: {
          actions: {
            autopay: autopayOn,
            plannedPurchase: result.done.has("planned_purchase"),
            paymentReminder: reminderOn && result.done.has("payment_reminder"),
          },
          state: "saved",
        },
      };
    }
    if (result.kind === "signed-out") return "signed-out";
    return { status: "failed", message: result.message };
  };
}

// Your first-month plan (S20), from the lo-fi board 219:2. Progress is saved
// as plan steps. The suggested monthly spending limit is 30% of the card's
// credit limit (US-04, lib/plan/spend-limit.ts).
export function FirstMonthPlan({
  application,
  paymentReminderOn = false,
  autopayOn = false,
}: {
  application: Application;
  paymentReminderOn?: boolean;
  autopayOn?: boolean;
}) {
  // useLoaded needs a load with one identity per application.
  const load = useMemo(
    () => loadPlan(application.id, paymentReminderOn, autopayOn),
    [application.id, paymentReminderOn, autopayOn],
  );
  // The return-path allow-list does not include this page, so Home it is.
  const { loaded, retry } = useLoaded(load, signInPath(ROUTES.home));
  const start: { actions: PlanActions; state: SaveState } =
    loaded.status === "ready" ? loaded.data : { actions: { ...NONE_DONE, autopay: autopayOn }, state: loaded.status };
  // A key per load state, so the checks start again from what was loaded.
  return (
    <PlanScreen
      key={loaded.status}
      application={application}
      start={start}
      onRetry={loaded.status === "failed" ? retry : null}
    />
  );
}

function PlanScreen({
  application,
  start,
  onRetry,
}: {
  application: Application;
  start: { actions: PlanActions; state: SaveState };
  onRetry: (() => void) | null;
}) {
  const router = useRouter();
  const [actions, setActions] = useState<PlanActions>(start.actions);
  // Fixed for this load: the screen is keyed on the load state.
  const state: SaveState = start.state;
  const [error, setError] = useState<string | null>(null);
  // Actions whose save is still in flight; each is locked until its answer arrives.
  const [saving, setSaving] = useState<Set<ActionKey>>(new Set());

  async function toggle(key: ActionKey) {
    const value = !actions[key];
    setActions((current) => ({ ...current, [key]: value }));
    setError(null);
    if (state !== "saved") return;
    const step = STEP[key];
    setSaving((current) => new Set(current).add(key));
    const result = step
      ? await savePlanStep(application.id, "first_month", step, value)
      : await saveAutopay(application.id, value);
    setSaving((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (result.kind === "ok") {
      // Autopay reaches this page in the server render: refresh it, or Back
      // from another screen restores the cached page with the old check.
      if (!step) router.refresh();
      return;
    }
    // Undo only this action, so other saves in flight are not overwritten.
    setActions((current) => ({ ...current, [key]: !value }));
    setError(result.kind === "failed" ? result.message : "Sign in again to save your plan.");
  }

  const done = Object.values(actions).filter(Boolean).length;

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">Your first-month plan</h1>
            <p className="text-body-m text-indigo-black">Start small and build good habits without taking on debt.</p>
          </div>

          <section className="flex items-center justify-between gap-3 rounded-card bg-off-white p-5">
            <h2 className="font-heading text-h6 font-medium text-navy">{application.cardName}</h2>
            <StatusPill>APPROVED</StatusPill>
          </section>

          <SpendingGuide creditLimitCents={application.creditLimitCents} />

          <section aria-labelledby="actions" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 id="actions" className="font-heading text-h6 font-medium text-indigo-black">
                Your first-month actions
              </h2>
              <p className="text-body-s text-indigo-black" aria-live="polite">
                {done} of {ACTIONS.length} done
              </p>
            </div>
            <ProgressBar current={done} total={ACTIONS.length} />
            <ul className="flex flex-col gap-3">
              {ACTIONS.map((action) => {
                const content = (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] border-violet",
                        actions[action.key] && "bg-violet text-white",
                      )}
                    >
                      {actions[action.key] ? <Check width={14} height={14} /> : null}
                    </span>
                    <span className="flex flex-col gap-0.5 text-indigo-black">
                      <span className="font-heading text-h6 font-medium">
                        {action.title}
                        {action.key === "paymentReminder" && actions[action.key] ? <span className="sr-only">, done</span> : null}
                      </span>
                      <span className="text-body-s">{action.detail}</span>
                    </span>
                  </>
                );
                return (
                  <li key={action.key}>
                    {action.key === "paymentReminder" ? (
                      // Opens the reminder screen instead of ticking (US-08), as on Home.
                      <Link href={paymentRemindersPath(application.id)} className={ACTION_ROW}>
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={actions[action.key]}
                        disabled={state === "loading" || saving.has(action.key)}
                        onClick={() => toggle(action.key)}
                        className={cn(ACTION_ROW, "disabled:cursor-progress")}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {state === "failed" ? (
            <div className="flex flex-col gap-2">
              <ErrorMessage>We couldn’t load your saved plan. Your checks won’t be kept.</ErrorMessage>
              {onRetry ? (
                <Button variant="link" className="self-start" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          {done === ACTIONS.length ? (
            <p role="status" className="rounded-input bg-off-white p-4 text-body-s text-indigo-black">
              All three done. Keep paying your statement balance in full by the due date.
            </p>
          ) : null}

          <Link href={ROUTES.home} className={cn(buttonVariants({ variant: "secondary" }), "mt-auto")}>
            Go to Home
          </Link>
          <p className="text-center text-body-s text-indigo-black/70">
            Based on what you told us, not your transactions. No bank account linking.
          </p>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

// The suggested monthly spending limit (US-04): 30% of the card's limit in
// dollars, or the rule alone when the limit was skipped at setup.
function SpendingGuide({ creditLimitCents }: { creditLimitCents: number | null }) {
  const suggested = suggestedSpendLimitCents(creditLimitCents);
  return (
    <section aria-labelledby="spending-guide" className="flex flex-col gap-2 rounded-card bg-off-white p-5">
      <h2 id="spending-guide" className="font-heading text-h6 font-medium text-indigo-black">
        Monthly spending guide
      </h2>
      {suggested !== null && creditLimitCents !== null ? (
        <>
          {/* Amounts are hidden from session replay, like the limit on Home. */}
          <p className={cn(SENSITIVE, "font-heading text-h3 font-medium text-navy")}>Up to {moneyAmount(suggested)} a month</p>
          <p className={cn(SENSITIVE, "text-body-s text-indigo-black")}>
            That&apos;s {SPEND_LIMIT_PERCENT}% of your {moneyAmount(creditLimitCents)} limit. Keeping your balance under{" "}
            {SPEND_LIMIT_PERCENT}% of your limit is better for your credit score, and lower is better.
          </p>
        </>
      ) : (
        <>
          <p className="font-heading text-h3 font-medium text-navy">Up to {SPEND_LIMIT_PERCENT}% of your limit</p>
          <p className="text-body-s text-indigo-black">
            Keeping your balance under {SPEND_LIMIT_PERCENT}% of your limit is better for your credit score.{" "}
            <Link href={ROUTES.home} className="underline">
              Add your credit limit on Home
            </Link>{" "}
            to see this in dollars.
          </p>
        </>
      )}
      <a href={SPEND_LIMIT_SOURCE.url} target="_blank" rel="noopener noreferrer" className="self-start text-body-s text-indigo-black underline">
        Why {SPEND_LIMIT_PERCENT}%? ({SPEND_LIMIT_SOURCE.name})
      </a>
    </section>
  );
}
