import { describe, expect, it } from "vitest";

import type { Reminder } from "@/lib/api/reminders";

import { reminderDeadline, snoozedView, snoozeOptions, updateGroups, updateItem, zonedHour, type ReminderCard } from "./in-app";

const NY = "America/New_York";
const APP = "00000000-0000-4000-8000-000000000001";
// Sunday Nov 8 2026, 18:00 in New York.
const NOW = new Date("2026-11-08T23:00:00Z");

const card = (over: Partial<ReminderCard> = {}): ReminderCard => ({
  cardName: "Discover it Student Cash Back", creditLimitCents: 50_000, paymentDueDay: 6, autopayStatus: "off", ...over,
});

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: "00000000-0000-4000-8000-0000000000a1",
  applicationId: APP,
  kind: "statement_closing",
  occurrence: "2026-11-13",
  remindOn: "2026-11-10",
  dueAt: "2026-11-10T14:00:00.000Z",
  sentAt: "2026-11-08T22:30:00.000Z",
  actedAt: null,
  readAt: null,
  snoozedUntil: null,
  dismissedAt: null,
  followUpAt: null,
  createdAt: "2026-11-01T15:00:00.000Z",
  ...over,
});

describe("zonedHour", () => {
  it("is 9:00 on the student's calendar, across daylight saving", () => {
    expect(zonedHour("2026-11-09", 9, NY).toISOString()).toBe("2026-11-09T14:00:00.000Z");
    expect(zonedHour("2026-07-01", 9, NY).toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedHour("2026-11-09", 9, "Asia/Tokyo").toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });
});

describe("reminderDeadline", () => {
  it("is the close for a statement reminder, then the payment due after it once followed up", () => {
    expect(reminderDeadline(reminder(), card())).toEqual({ date: "2026-11-13", label: "Statement closes" });
    expect(reminderDeadline(reminder({ followUpAt: NOW.toISOString() }), card())).toEqual({ date: "2026-12-06", label: "Payment due" });
    expect(reminderDeadline(reminder({ followUpAt: NOW.toISOString() }), card({ paymentDueDay: null }))).toBeNull();
    expect(reminderDeadline(reminder({ kind: "reapply" }), card())).toBeNull();
  });
});

describe("snoozeOptions", () => {
  it("offers the three times at 9:00, the day before the close last", () => {
    const options = snoozeOptions(reminder(), card(), NOW, NY);
    expect(options.map((o) => [o.choice, o.date, o.until.toISOString()])).toEqual([
      ["tomorrow", "2026-11-09", "2026-11-09T14:00:00.000Z"],
      ["in_2_days", "2026-11-10", "2026-11-10T14:00:00.000Z"],
      ["day_before_due", "2026-11-12", "2026-11-12T14:00:00.000Z"],
    ]);
  });

  it("never snoozes past the due date, and drops a day-before that repeats another", () => {
    // closes Tuesday: in 2 days is the close itself, the day before is tomorrow
    const options = snoozeOptions(reminder({ occurrence: "2026-11-10" }), card(), NOW, NY);
    expect(options.map((o) => o.choice)).toEqual(["tomorrow", "in_2_days"]);
    // closes tomorrow: only tomorrow morning
    expect(snoozeOptions(reminder({ occurrence: "2026-11-09" }), card(), NOW, NY).map((o) => o.choice)).toEqual(["tomorrow"]);
    // closed today: nothing left
    expect(snoozeOptions(reminder({ occurrence: "2026-11-08" }), card(), NOW, NY)).toEqual([]);
  });

  it("never offers today, before or after 9 AM on the student's calendar", () => {
    // Closes Tuesday Nov 10, so the day before it is due is Monday Nov 9.
    const closesTuesday = reminder({ occurrence: "2026-11-10" });
    // Monday Nov 9, 7:00 in New York: the day before is today, 9 AM is hours away.
    const early = new Date("2026-11-09T12:00:00Z");
    expect(snoozeOptions(closesTuesday, card(), early, NY).map((o) => [o.choice, o.date])).toEqual([["tomorrow", "2026-11-10"]]);
    // Monday Nov 9, 10:00 in New York: still only tomorrow.
    const late = new Date("2026-11-09T15:00:00Z");
    expect(snoozeOptions(closesTuesday, card(), late, NY).map((o) => [o.choice, o.date])).toEqual([["tomorrow", "2026-11-10"]]);
    // Monday Nov 9, 7:00, closing Friday: every option is a later day.
    expect(snoozeOptions(reminder(), card(), early, NY).map((o) => o.date)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
  });

  it("has no day-before choice without a due date", () => {
    expect(snoozeOptions(reminder({ kind: "reapply" }), card(), NOW, NY).map((o) => o.choice)).toEqual(["tomorrow", "in_2_days"]);
  });
});

describe("updateItem", () => {
  it("shows a sent statement reminder as new, with its pay-down target masked", () => {
    expect(updateItem(reminder(), card(), NOW, NY)).toMatchObject({
      group: "new", icon: "bell", title: "Statement closes Fri", description: "Pay down to $150 or less.",
      sensitive: true, time: "Now", action: { type: "paid", label: "I paid it down" }, href: null,
    });
  });

  it("leaves out unsent and dismissed reminders", () => {
    expect(updateItem(reminder({ sentAt: null }), card(), NOW, NY)).toBeNull();
    expect(updateItem(reminder({ dismissedAt: NOW.toISOString() }), card(), NOW, NY)).toBeNull();
  });

  it("moves a snoozed one to Snoozed, then back to New when the snooze ends", () => {
    const snoozed = reminder({ snoozedUntil: "2026-11-10T14:00:00.000Z", readAt: "2026-11-08T22:40:00.000Z" });
    expect(updateItem(snoozed, card(), NOW, NY)).toMatchObject({
      group: "snoozed", description: "Snoozed until Tue.", time: "Tue", action: null, snooze: [], sensitive: false,
    });
    const later = new Date("2026-11-10T15:00:00Z");
    expect(updateItem(snoozed, card(), later, NY)).toMatchObject({ group: "new", time: "1h", snooze: [{ choice: "tomorrow", label: "Tomorrow morning" }, { choice: "in_2_days", label: "In 2 days" }] });
  });

  it("is Earlier once read, marked paid, or past its date", () => {
    expect(updateItem(reminder({ readAt: NOW.toISOString() }), card(), NOW, NY)?.group).toBe("earlier");
    expect(updateItem(reminder({ actedAt: NOW.toISOString() }), card(), NOW, NY)).toMatchObject({
      group: "earlier", description: "You marked it paid.", action: null, snooze: [],
    });
    expect(updateItem(reminder({ occurrence: "2026-11-07" }), card(), NOW, NY)).toMatchObject({
      group: "earlier", title: "Statement closed Sat", action: null,
    });
  });

  it("turns a followed-up statement reminder into the follow-up card that opens its own screen", () => {
    const followUp = reminder({ occurrence: "2026-11-06", sentAt: "2026-11-03T14:00:00.000Z", followUpAt: "2026-11-08T14:00:00.000Z", readAt: "2026-11-07T12:00:00.000Z" });
    expect(updateItem(followUp, card(), NOW, NY)).toMatchObject({
      group: "new", icon: "file", title: "Time to pay off your card",
      description: "Statement closed Fri. Pay the full balance by Dec 6.", time: "9h",
      action: { type: "paid", label: "I paid it" }, href: `/updates/${followUp.id}`,
    });
  });

  it("gives each kind its one action", () => {
    expect(updateItem(reminder({ kind: "payment_due", occurrence: "2026-12-06" }), card(), NOW, NY)).toMatchObject({
      title: "Payment due Dec 6", description: "Pay the full statement balance.", action: { type: "paid", label: "I paid it" },
    });
    expect(updateItem(reminder({ kind: "check_autopay", occurrence: "2026-11-06" }), card(), NOW, NY)?.action).toEqual({
      type: "link", label: "Check autopay", href: `/plan?application=${APP}`,
    });
    expect(updateItem(reminder({ kind: "reapply", occurrence: "2026-11-08" }), card(), NOW, NY)?.action).toEqual({
      type: "link", label: "See your plan", href: `/denied/plan?application=${APP}`,
    });
  });
});

describe("updateGroups", () => {
  it("groups newest first and skips a reminder whose card is gone", () => {
    const older = reminder({ id: "00000000-0000-4000-8000-0000000000a2", sentAt: "2026-11-07T14:00:00.000Z" });
    const orphan = reminder({ id: "00000000-0000-4000-8000-0000000000a3", applicationId: "00000000-0000-4000-8000-000000000009" });
    const groups = updateGroups([older, reminder(), orphan], new Map([[APP, card()]]), NOW, NY);
    expect(groups.new.map((i) => i.id)).toEqual([reminder().id, older.id]);
    expect(groups.snoozed).toEqual([]);
    expect(groups.earlier).toEqual([]);
  });
});

describe("snoozedView", () => {
  it("says tomorrow, or the weekday it comes back, and the due date", () => {
    expect(snoozedView(reminder({ snoozedUntil: "2026-11-09T14:00:00.000Z" }), card(), NOW, NY)).toEqual({
      day: "tomorrow", comesBack: "Tomorrow, 9 AM", deadline: { label: "Statement closes", date: "Fri, Nov 13" },
    });
    expect(snoozedView(reminder({ snoozedUntil: "2026-11-10T14:00:00.000Z", followUpAt: NOW.toISOString() }), card(), NOW, NY)).toEqual({
      day: "Tue", comesBack: "Tue, 9 AM", deadline: { label: "Payment due", date: "Sun, Dec 6" },
    });
  });
});
