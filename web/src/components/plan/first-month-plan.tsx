"use client";

import Check from "@gravity-ui/icons/Check";
import Link from "next/link";
import { useState } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { pendingRequest, type PlanActions } from "@/lib/api-client/pending";
import type { Application } from "@/lib/api/application";
import { ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";
import { cn } from "@/lib/utils";

type ActionKey = keyof PlanActions;

const ACTIONS: { key: ActionKey; title: string; detail: string }[] = [
  { key: "autopay", title: "Turn on autopay", detail: "Set autopay for at least the minimum payment, or the full statement balance if your bank account can always cover it." },
  { key: "plannedPurchase", title: "Choose one planned purchase", detail: "Pick a small expense you already budget for and can pay off in full." },
  { key: "paymentReminder", title: "Set a payment reminder", detail: "Use the due date on your card statement." },
];

const NONE_DONE: PlanActions = { autopay: false, plannedPurchase: false, paymentReminder: false };

type SaveState = "loading" | "saved" | "unavailable" | "failed";

type SavedPlan = { actions: PlanActions; state: "saved" | "unavailable" };

async function loadPlan(): Promise<LoadOutcome<SavedPlan>> {
  const result = await pendingRequest("GET /plan");
  if (result.kind === "ok") return { status: "ready", data: { actions: result.data.actions, state: "saved" } };
  // No plan saved yet: start empty, with saving on.
  if (result.kind === "failed" && result.code === "not_found") {
    return { status: "ready", data: { actions: NONE_DONE, state: "saved" } };
  }
  if (result.kind === "unavailable") return { status: "ready", data: { actions: NONE_DONE, state: "unavailable" } };
  if (result.kind === "signed-out") return "signed-out";
  return { status: "failed", message: result.message };
}

// Your first-month plan (S20), from the lo-fi board 219:2. Progress is saved
// through spec C3 once it exists; until then the screen says checks are not
// kept. The lo-fi's "suggested monthly spending limit" is left out: there is
// no sourced, rules-approved way to work one out yet.
export function FirstMonthPlan({ application }: { application: Application }) {
  // The return-path allow-list does not include this page, so Home it is.
  const { loaded, retry } = useLoaded(loadPlan, signInPath(ROUTES.home));
  const start: { actions: PlanActions; state: SaveState } =
    loaded.status === "ready" ? loaded.data : { actions: NONE_DONE, state: loaded.status };
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
  const [actions, setActions] = useState<PlanActions>(start.actions);
  const [state, setState] = useState<SaveState>(start.state);
  const [error, setError] = useState<string | null>(null);
  // Actions whose save is still in flight; each is locked until its answer arrives.
  const [saving, setSaving] = useState<Set<ActionKey>>(new Set());

  async function toggle(key: ActionKey) {
    const value = !actions[key];
    setActions((current) => ({ ...current, [key]: value }));
    setError(null);
    if (state !== "saved") return;
    setSaving((current) => new Set(current).add(key));
    const result = await pendingRequest("PATCH /plan", { actions: { [key]: value } });
    setSaving((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (result.kind === "ok") {
      // Only this action is taken from the answer, so other saves in flight are not overwritten.
      setActions((current) => ({ ...current, [key]: result.data.actions[key] }));
      return;
    }
    // Undo only this action.
    setActions((current) => ({ ...current, [key]: !value }));
    if (result.kind === "unavailable") setState("unavailable");
    else setError(result.kind === "failed" ? result.message : "Sign in again to save your plan.");
  }

  const done = Object.values(actions).filter(Boolean).length;

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} title="My card, month 1" />
        <main className="flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">Your first-month plan</h1>
            <p className="text-body-m text-indigo-black">Start small and build good habits without taking on debt.</p>
          </div>

          <section className="flex items-center justify-between gap-3 rounded-card bg-off-white p-5">
            <h2 className="font-heading text-h6 font-medium text-navy">{application.cardName}</h2>
            <StatusPill>APPROVED</StatusPill>
          </section>

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
              {ACTIONS.map((action) => (
                <li key={action.key}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={actions[action.key]}
                    disabled={state === "loading" || saving.has(action.key)}
                    onClick={() => toggle(action.key)}
                    className="flex w-full items-start gap-3 rounded-input border-[1.5px] border-violet bg-white p-4 text-left outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress"
                  >
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
                      <span className="font-heading text-h6 font-medium">{action.title}</span>
                      <span className="text-body-s">{action.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {state === "unavailable" ? (
            <p role="status" className="rounded-input border border-hairline p-4 text-body-s text-indigo-black">
              Saving your plan isn’t available yet, so your checks won’t be kept after you leave this page.
            </p>
          ) : null}
          {state === "failed" ? (
            <div className="flex flex-col gap-2">
              <ErrorMessage>We couldn’t load your saved plan. Your checks won’t be kept.</ErrorMessage>
              {onRetry ? (
                <Button variant="link" className="self-start text-violet" onClick={onRetry}>
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
