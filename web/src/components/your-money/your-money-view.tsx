"use client";

// Created with Claude Code (2026-11-13). Your money (US-12, Figma D2 709:1520
// and B1 709:1769): one page, two tabs, opened by tapping the Safe to spend
// card on Home. Today shows how the daily number adds up; This month shows
// the budget. Same layout and rows on both. The frames draw no bottom bar.
// The tabs switch on the page, with no reload: the open pill slides across
// and the address changes in place, so a reload still opens the same tab
// (Ben, Nov 15: the reload between tabs felt harsh).
import { useCallback, useMemo, useRef, useState } from "react";

import { MonthTab } from "@/components/your-money/month-tab";
import { TodayTab } from "@/components/your-money/today-tab";
import { MoneyTabsContext } from "@/components/your-money/parts";
import { AppHeader } from "@/components/ui/app-header";
import type { Budget } from "@/lib/api/budget";
import type { BillAnswer, SafeToSpendData } from "@/lib/api-client/safe-to-spend";
import type { SavedAnswers, SharedAnswers } from "@/components/your-money/parts";
import { YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { ROUTES, yourMoneyPath, type YourMoneyTab } from "@/lib/routes";

export function YourMoneyView({
  tab: initialTab,
  data,
  budget,
  today,
  hasGoal = false,
}: {
  tab: YourMoneyTab;
  data: SafeToSpendData;
  // This month's budget; null only when it could not be read, and then the
  // This month tab loads its page instead of switching in place.
  budget: Budget | null;
  // Today's day of the month on the app's calendar, for which bills are still to come.
  today: number;
  // Whether the student has a goal (Pick a goal): the savings goal line says
  // Change goal or Set a goal.
  hasGoal?: boolean;
}) {
  const [tab, setTab] = useState<YourMoneyTab>(initialTab);
  // The tab the student came from, so the open pill slides from its side.
  const [from, setFrom] = useState<YourMoneyTab | null>(null);

  // True when the tab switched in place; false lets the link load the page.
  const select = useCallback(
    (next: YourMoneyTab): boolean => {
      if (next === tab) return true;
      if (next === "month" && !budget) return false;
      setFrom(tab);
      setTab(next);
      // Null state, as Next asks, so its router takes the new address too.
      window.history.replaceState(null, "", yourMoneyPath(next));
      return true;
    },
    [tab, budget],
  );
  const context = useMemo(() => ({ select, from }), [select, from]);

  // The student's answers (bills and savings goal), one copy for both tabs,
  // and one queue for every save on the page. A save started on one tab and
  // finished after the student switched lands here, so the other tab shows it
  // and its next save sends it, never an older number (review of #113, Nov 15).
  // Only this page changes them, so after the first load the page's own copy
  // is the truth: a refresh that answers before a later save lands can never
  // put an older number back.
  const [answers, setAnswers] = useState<SavedAnswers>(() => ({ bills: data.bills as BillAnswer[], setAsideCents: data.setAsideCents }));
  const answersRef = useRef(answers);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const shared = useMemo<SharedAnswers>(
    () => ({
      answers,
      latest: () => answersRef.current,
      saved: (next) => {
        answersRef.current = next;
        setAnswers(next);
      },
      enqueue: (task) => {
        const run = queue.current.then(task, task);
        queue.current = run.catch(() => undefined);
        return run;
      },
    }),
    [answers],
  );

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="flex flex-1 flex-col px-6 pt-3 pb-6">
          {/* The frames name the page by its hero; screen readers get a heading. */}
          <h1 className="sr-only">{YOUR_MONEY_COPY.title}</h1>
          <MoneyTabsContext.Provider value={context}>
            {/* A quick fade as the rows change, none with reduced motion. */}
            <div key={tab} className="flex flex-1 flex-col gap-2 motion-safe:animate-[tab-fade_180ms_ease-out]">
              {tab === "month" && budget ? (
                <MonthTab budget={budget} shared={shared} />
              ) : (
                <TodayTab data={data} today={today} shared={shared} hasGoal={hasGoal} />
              )}
            </div>
          </MoneyTabsContext.Provider>
        </main>
      </div>
    </div>
  );
}
