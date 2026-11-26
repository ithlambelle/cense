"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GroupHeading, ReadRow, TotalRow } from "@/components/your-money/parts";
import { BACK_CONTROL } from "@/components/ui/app-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SENSITIVE, track } from "@/lib/analytics";
import type { Goal } from "@/lib/api/goals";
import { saveSafeToSpendAnswers, type BillAnswer } from "@/lib/api-client/safe-to-spend";
import { formatIsoDate } from "@/lib/dates";
import { PLAN_COPY } from "@/lib/goals/copy";
import type { PlanSummary } from "@/lib/goals/plan";
import { moneyAmount } from "@/lib/money";
import { ROUTES, signInPath } from "@/lib/routes";
import { MAX_MONTHLY_CENTS } from "@/lib/safe-to-spend/compute";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

// Created with Claude Code (2026-11-26). Your plan (US-17, Demo Day step 5,
// Gap Plan slice 6): the goal, then a month in four lines (money in, bills,
// the set-aside, what is left), with Accept plan and Edit. Accept saves the
// set-aside as the student's monthly savings goal (D40), the same save Your
// money makes, so safe to spend on Home and This month change with it, then
// Home. Per month, not per paycheck: pay frequency is not saved anywhere yet.
// No Figma frame exists for it; the rows are Looks right?'s and This month's.
export function YourPlan({
  goal,
  bills,
  previousSetAsideCents,
  summary,
}: {
  goal: Goal;
  // The student's saved answers, sent back unchanged with the new set-aside.
  bills: BillAnswer[];
  previousSetAsideCents: number;
  summary: PlanSummary;
}) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { monthlyCents, byDate } = goal.plan;
  const tooMuch = monthlyCents > MAX_MONTHLY_CENTS;
  const replaces = previousSetAsideCents > 0 && previousSetAsideCents !== monthlyCents;
  const short = summary.leftCents !== null && summary.leftCents < 0;

  async function accept() {
    if (pending || tooMuch) return;
    setPending(true);
    setError(null);
    const result = await saveSafeToSpendAnswers({ bills, setAsideCents: monthlyCents });
    if (!isMounted()) return;
    if (result.kind === "ok") {
      track("goal_plan_saved", { preset: goal.preset });
      // Home, where safe to spend now leaves the set-aside out. Replace: the
      // plan is saved, so Back never reopens it.
      router.replace(ROUTES.home);
      router.refresh();
      return;
    }
    setPending(false);
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.startPlan));
    setError(result.message);
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        {/* Back replaces this step with Pick a goal, as the setup questions'
            arrow does, so the steps never stack in history. */}
        <header className="box-content flex h-14 items-center px-6 pt-8">
          <Link href={ROUTES.startGoal} replace aria-label="Back to Pick a goal" className={cn(BACK_CONTROL, "focus-visible:outline-ring")}>
            <Image src="/icons/arrow-left-dark.svg" alt="" width={48} height={48} />
          </Link>
        </header>
        <main className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h3 font-medium text-navy">{PLAN_COPY.title}</h1>
            <p className={cn(SENSITIVE, "text-body-m text-indigo-black")}>
              {PLAN_COPY.goalLine(goal.name, moneyAmount(goal.amountCents), formatIsoDate(byDate) ?? byDate)}
            </p>
          </div>

          <section aria-labelledby="plan-month" className="flex flex-col gap-1">
            <GroupHeading id="plan-month">{PLAN_COPY.monthHeading}</GroupHeading>
            <ul className="flex flex-col">
              {summary.incomeCents !== null ? <ReadRow label={PLAN_COPY.income} value={moneyAmount(summary.incomeCents)} /> : null}
              <ReadRow label={PLAN_COPY.bills} value={moneyAmount(summary.billsCents)} />
              <ReadRow label={PLAN_COPY.setAside} value={moneyAmount(summary.setAsideCents)} />
              {summary.leftCents !== null ? (
                <TotalRow label={short ? PLAN_COPY.short : PLAN_COPY.left} value={moneyAmount(Math.abs(summary.leftCents))} />
              ) : null}
            </ul>
          </section>

          {replaces ? <p className={cn(SENSITIVE, "text-body-s text-indigo-black/70")}>{PLAN_COPY.replaces(moneyAmount(previousSetAsideCents))}</p> : null}
          {tooMuch ? <ErrorMessage>{PLAN_COPY.tooMuch}</ErrorMessage> : null}

          <div className="flex-1" />
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          <div className="flex flex-col gap-2">
            <Button type="button" pending={pending} disabled={tooMuch} onClick={accept}>
              {PLAN_COPY.accept}
            </Button>
            <Link href={ROUTES.startGoal} replace className={buttonVariants({ variant: "secondary" })}>
              {PLAN_COPY.edit}
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
