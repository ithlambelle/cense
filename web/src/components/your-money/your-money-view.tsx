// Created with Claude Code (2026-11-13). Your money (US-12, Figma D2 709:1520
// and B1 709:1769): one page, two tabs, opened by tapping the Safe to spend
// card on Home. Today shows how the daily number adds up; This month shows
// the budget. Same layout and rows on both. The frames draw no bottom bar.
import { MonthTab } from "@/components/your-money/month-tab";
import { TodayTab } from "@/components/your-money/today-tab";
import { AppHeader } from "@/components/ui/app-header";
import type { Budget } from "@/lib/api/budget";
import type { BillAnswer, SafeToSpendData } from "@/lib/api-client/safe-to-spend";
import { YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { ROUTES, type YourMoneyTab } from "@/lib/routes";

export function YourMoneyView({
  tab,
  data,
  budget,
  today,
}: {
  tab: YourMoneyTab;
  data: SafeToSpendData;
  // Read only for This month.
  budget: Budget | null;
  // Today's day of the month on the app's calendar, for which bills are still to come.
  today: number;
}) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="flex flex-1 flex-col gap-2 px-6 pt-3 pb-6">
          {/* The frames name the page by its hero; screen readers get a heading. */}
          <h1 className="sr-only">{YOUR_MONEY_COPY.title}</h1>
          {tab === "month" && budget ? (
            <MonthTab budget={budget} answers={{ bills: data.bills as BillAnswer[], setAsideCents: data.setAsideCents }} />
          ) : (
            <TodayTab data={data} today={today} />
          )}
        </main>
      </div>
    </div>
  );
}
