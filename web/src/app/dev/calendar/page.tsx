import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CalendarView } from "@/components/calendar/calendar-view";
import { calendarEntry, monthRange } from "@/lib/calendar/month";
import { devPagesEnabled } from "@/lib/dev-only";
import { datedEvents } from "@/lib/home/coming-up";

export const metadata: Metadata = { title: "Calendar preview", robots: { index: false } };

// Created with Claude Code (2026-11-21). The Calendar on the C1 frame's own
// sample (821:9293), for design review and screenshots: Wednesday Nov 11,
// Discover due the 12th and closing the 18th, rent the 15th and 22nd's phone,
// pay every two weeks from the 1st. Development only.
const TODAY = "2026-11-11";

export default function CalendarPreviewPage() {
  if (!devPagesEnabled()) notFound();
  const { first, last } = monthRange(TODAY);
  const events = datedEvents({
    from: first,
    last,
    cards: [
      {
        applicationId: "00000000-0000-4000-8000-000000000001",
        name: "Discover",
        creditLimitCents: 50_000,
        statementClosingDay: 18,
        paymentDueDay: 12,
        autopayStatus: "on",
      },
    ],
    bills: [
      { bill: "rent", coveredBy: "me", monthlyCents: 65_000, dueDay: 15 },
      { bill: "phone", coveredBy: "me", monthlyCents: 4_500, dueDay: 22 },
    ],
    paychecks: ["2026-11-01", "2026-11-15", "2026-11-29"].map((date) => ({ date, amountCents: 48_000 })),
  });
  return <CalendarView today={TODAY} entries={events.map((event) => calendarEntry(event, TODAY))} />;
}
