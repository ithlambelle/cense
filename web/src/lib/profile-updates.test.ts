import { describe, expect, it } from "vitest";

import type { Reminder } from "@/lib/api/reminders";
import type { ReminderCard } from "@/lib/reminders/in-app";

import { profileUpdates } from "./profile-updates";

// Sunday Nov 8 2026, 13:00 in New York.
const NOW = new Date("2026-11-08T18:00:00Z");
const NY = "America/New_York";
const APP = "00000000-0000-4000-8000-000000000001";
const CARDS = new Map<string, ReminderCard>([[APP, { cardName: "Discover it", creditLimitCents: 50_000, paymentDueDay: 6, autopayStatus: "off" }]]);

let next = 0;
const sent = (kind: Reminder["kind"], occurrence: string, sentAt: string, over: Partial<Reminder> = {}): Reminder => ({
  id: `00000000-0000-4000-8000-0000000000${String(++next).padStart(2, "0")}`,
  applicationId: APP, kind, occurrence, remindOn: occurrence, dueAt: sentAt, sentAt, actedAt: null, readAt: null,
  snoozedUntil: null, dismissedAt: null, followUpAt: null, createdAt: "2026-10-01T00:00:00.000Z", ...over,
});

describe("profileUpdates (F5)", () => {
  it("has nothing to show before any reminder is sent", () => {
    expect(profileUpdates([], CARDS, NY, NOW)).toEqual({ newCount: 0, latest: null });
  });

  it("shows the latest sent reminder, and counts the ones Updates shows as New", () => {
    const updates = profileUpdates(
      [
        sent("payment_due", "2026-12-06", "2026-11-05T13:00:00.000Z"),
        sent("statement_closing", "2026-11-13", "2026-11-08T13:00:00.000Z"),
      ],
      CARDS, NY, NOW,
    );
    expect(updates).toEqual({ newCount: 2, latest: { title: "Statement closes Nov 13", body: "Pay it down before then.", when: "Today" } });
  });

  it("leaves read, dismissed and closed ones out of the count", () => {
    const updates = profileUpdates(
      [
        sent("payment_due", "2026-12-06", "2026-11-05T13:00:00.000Z", { readAt: "2026-11-06T12:00:00.000Z" }),
        sent("statement_closing", "2026-11-13", "2026-11-07T13:00:00.000Z", { dismissedAt: "2026-11-07T14:00:00.000Z" }),
        // Closed yesterday and never read: nothing left to do, so not New.
        sent("statement_closing", "2026-11-07", "2026-11-04T13:00:00.000Z"),
        sent("reapply", "2026-11-05", "2026-11-05T13:00:00.000Z"),
      ],
      CARDS, NY, NOW,
    );
    expect(updates.newCount).toBe(1);
    // The dismissed one is never the latest.
    expect(updates.latest).toMatchObject({ title: "Payment due Dec 6", when: "Nov 5" });
  });

  it("says Today on the student's calendar, not UTC's", () => {
    // 9 PM in New York on Nov 7 is Nov 8 in UTC.
    const reminders = [sent("payment_due", "2026-11-10", "2026-11-08T02:00:00.000Z")];
    expect(profileUpdates(reminders, CARDS, NY, new Date("2026-11-08T03:00:00Z")).latest?.when).toBe("Today");
    expect(profileUpdates(reminders, CARDS, NY, new Date("2026-11-08T14:00:00Z")).latest?.when).toBe("Nov 7");
    expect(profileUpdates(reminders, CARDS, "UTC", new Date("2026-11-08T14:00:00Z")).latest?.when).toBe("Today");
  });
});
