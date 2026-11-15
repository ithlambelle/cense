"use client";

// Created with Claude Code (2026-11-13). Your money (US-12, Figma D2 709:1520
// and B1 709:1769): one page, two tabs, opened by tapping the Safe to spend
// card on Home. Today shows how the daily number adds up; This month shows
// the budget. Same layout and rows on both. The frames draw no bottom bar.
// The tabs switch on the page, with no reload: the open pill slides across
// and the address changes in place, so a reload still opens the same tab
// (Ben, Nov 15: the reload between tabs felt harsh).
import { useCallback, useMemo, useState } from "react";

import { MonthTab } from "@/components/your-money/month-tab";
import { TodayTab } from "@/components/your-money/today-tab";
import { MoneyTabsContext } from "@/components/your-money/parts";
import { AppHeader } from "@/components/ui/app-header";
import type { Budget } from "@/lib/api/budget";
import type { BillAnswer, SafeToSpendData } from "@/lib/api-client/safe-to-spend";
import { YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { ROUTES, yourMoneyPath, type YourMoneyTab } from "@/lib/routes";

export function YourMoneyView({
  tab: initialTab,
  data,
  budget,
  today,
}: {
  tab: YourMoneyTab;
  data: SafeToSpendData;
  // This month's budget; null only when it could not be read, and then the
  // This month tab loads its page instead of switching in place.
  budget: Budget | null;
  // Today's day of the month on the app's calendar, for which bills are still to come.
  today: number;
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
                <MonthTab budget={budget} answers={{ bills: data.bills as BillAnswer[], setAsideCents: data.setAsideCents }} />
              ) : (
                <TodayTab data={data} today={today} />
              )}
            </div>
          </MoneyTabsContext.Provider>
        </main>
      </div>
    </div>
  );
}
