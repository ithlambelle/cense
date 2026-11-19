// Created with Claude Code (2026-11-19). Coming up on Home (D1): which dates,
// in what order, and how each row reads and where it goes.
import { describe, expect, it } from "vitest";

import { addDays, followingReminder, nextReminders } from "@/lib/reminders/schedule";
import type { BillAnswer } from "@/lib/safe-to-spend/compute";

import { comingUp, comingUpCardNames, comingUpRows, COMING_UP_DAYS, COMING_UP_MAX_ROWS, type ComingUpCard } from "./coming-up";

const DISCOVER_ID = "00000000-0000-4000-8000-000000000001";
const CHIME_ID = "00000000-0000-4000-8000-000000000002";

function card(extra: Partial<ComingUpCard> = {}): ComingUpCard {
  return {
    applicationId: DISCOVER_ID,
    name: "Discover",
    creditLimitCents: 50_000,
    statementClosingDay: 13,
    paymentDueDay: 6,
    autopayStatus: "off",
    ...extra,
  };
}

const rent = (dueDay: number | null, extra: Partial<BillAnswer> = {}): BillAnswer => ({
  bill: "rent",
  coveredBy: "me",
  monthlyCents: 65_000,
  dueDay,
  ...extra,
});

const dates = (events: { kind: string; date: string }[]) => events.map((event) => `${event.kind} ${event.date}`);

describe("comingUp", () => {
  // Figma D1 (709:1465): Monday Nov 9, Discover closes on the 13th and is due
  // on the 6th, rent on the 15th, a paycheck on the 20th.
  it("lists the frame's rows, soonest first, with the paycheck plugged in", () => {
    const rows = comingUpRows({
      today: "2026-11-09",
      cards: [card()],
      bills: [rent(15)],
      paychecks: [{ date: "2026-11-20", amountCents: 48_000 }],
    });
    expect(rows.map(({ title, subtitle }) => [title, subtitle])).toEqual([
      ["Nov 13  Statement closes", "Discover · pay down to $150"],
      ["Nov 15  Rent, $650", "You cover it · you typed this"],
      ["Nov 20  Paycheck, $480", "Looks like pay · from your bank"],
      ["Dec 6  Payment due", "Autopay is off. Set it up"],
    ]);
  });

  it("leaves paychecks out cleanly until they are passed", () => {
    const rows = comingUpRows({ today: "2026-11-09", cards: [card()], bills: [rent(15)] });
    expect(rows.map((row) => row.title)).toEqual(["Nov 13  Statement closes", "Nov 15  Rent, $650", "Dec 6  Payment due"]);
    expect(rows.some((row) => /Paycheck/.test(row.title))).toBe(false);
  });

  it("puts a due day of 29 to 31 on a shorter month's last day, as the reminder emails do", () => {
    const short = card({ statementClosingDay: 31, paymentDueDay: 29 });
    expect(dates(comingUp({ today: "2027-02-10", cards: [short], bills: [] }))).toEqual([
      "statement_closes 2027-02-28",
      "payment_due 2027-02-28",
    ]);
    // A leap year keeps the 29th.
    expect(dates(comingUp({ today: "2028-02-10", cards: [short], bills: [] }))).toEqual([
      "statement_closes 2028-02-29",
      "payment_due 2028-02-29",
    ]);
    // April has 30 days; a bill due on the 31st is due on the 30th.
    expect(dates(comingUp({ today: "2027-04-05", cards: [], bills: [rent(31)] }))).toEqual(["bill 2027-04-30"]);
  });

  it("lists a day twice when the 30 days cross a short month", () => {
    // Jan 30 to Feb 28: the 30th falls on Jan 30 and, in February, on the 28th.
    expect(dates(comingUp({ today: "2027-01-30", cards: [], bills: [rent(30)] }))).toEqual(["bill 2027-01-30", "bill 2027-02-28"]);
  });

  it("matches the reminder emails' dates for every day of the month across a year", () => {
    for (let offset = 0; offset < 366; offset++) {
      const today = addDays("2026-11-19", offset);
      for (let day = 1; day <= 31; day++) {
        const days = { statementClosingDay: day, paymentDueDay: day };
        const events = comingUp({ today, cards: [card(days)], bills: [] });
        const emails = nextReminders(days, today);
        const closing = emails.find((email) => email.kind === "statement_closing")!;
        // The first statement date is the first closing email's date, when
        // it falls in the 30 days (on the 1st of a 31-day month, the 31st is
        // 30 days later, past the window).
        const inWindow = closing.occurrence <= addDays(today, COMING_UP_DAYS - 1);
        expect(events.find((event) => event.kind === "statement_closes")?.date, `${today} day ${day}`).toBe(
          inWindow ? closing.occurrence : undefined,
        );
        // A second one in the window is the next cycle's email.
        const second = events.filter((event) => event.kind === "statement_closes")[1];
        if (second) expect(second.date).toBe(followingReminder(days, closing)!.occurrence);
      }
    }
  });

  it("includes a date that is today", () => {
    const events = comingUp({ today: "2026-11-13", cards: [card()], bills: [rent(13)] });
    expect(dates(events).slice(0, 2)).toEqual(["statement_closes 2026-11-13", "bill 2026-11-13"]);
    expect(comingUpRows({ today: "2026-11-13", cards: [card()], bills: [] })[0].title).toBe("Nov 13  Statement closes");
  });

  it("keeps to the next 30 days: day 30 after today is out", () => {
    expect(COMING_UP_DAYS).toBe(30);
    const today = "2026-11-09";
    // Dec 8 is the 30th day (today and 29 more); Dec 9 is past it.
    expect(dates(comingUp({ today, cards: [], bills: [rent(8)] }))).toEqual(["bill 2026-12-08"]);
    expect(dates(comingUp({ today, cards: [], bills: [rent(9)] }))).toEqual(["bill 2026-11-09"]);
    expect(dates(comingUp({ today, cards: [], bills: [], paychecks: [{ date: "2026-12-09", amountCents: 100 }, { date: "2026-11-08", amountCents: 100 }] }))).toEqual([]);
  });

  it("looks as many days ahead as it is told: safe to spend's own days when a bank is linked", () => {
    const today = "2026-11-09";
    // 14 days: Nov 22 is the last day in, Nov 23 is past it.
    expect(dates(comingUp({ today, cards: [], bills: [rent(22)], days: 14 }))).toEqual(["bill 2026-11-22"]);
    expect(dates(comingUp({ today, cards: [], bills: [rent(23)], days: 14 }))).toEqual([]);
    // 45 days reaches Dec 23; the default 30 stops at Dec 8.
    expect(dates(comingUp({ today, cards: [], bills: [rent(20)], days: 45 }))).toEqual(["bill 2026-11-20", "bill 2026-12-20"]);
    expect(dates(comingUp({ today, cards: [], bills: [rent(20)] }))).toEqual(["bill 2026-11-20"]);
    // No bank linked: Home passes no days and the default 30 holds.
    expect(dates(comingUp({ today, cards: [], bills: [rent(20)], days: undefined }))).toEqual(["bill 2026-11-20"]);
  });

  it("orders several cards' dates together, shows four rows at most and names each card's payment", () => {
    const discover = card({ statementClosingDay: 20, paymentDueDay: 12, autopayStatus: "on" });
    const chime = card({ applicationId: CHIME_ID, name: "Chime", creditLimitCents: null, statementClosingDay: 12, paymentDueDay: 25, autopayStatus: "unknown" });
    const rows = comingUpRows({ today: "2026-11-10", cards: [discover, chime], bills: [rent(15)] });
    expect(rows).toHaveLength(COMING_UP_MAX_ROWS);
    expect(rows.map(({ title, subtitle }) => [title, subtitle])).toEqual([
      // Same day: the statement before the payment.
      ["Nov 12  Statement closes", "Chime"],
      ["Nov 12  Payment due", "Discover · autopay is on"],
      ["Nov 15  Rent, $650", "You cover it · you typed this"],
      ["Nov 20  Statement closes", "Discover · pay down to $150"],
    ]);
    // The fifth, Chime's payment on the 25th, waits.
    expect(comingUp({ today: "2026-11-10", cards: [discover, chime], bills: [rent(15)] }).map((event) => event.date)).not.toContain("2026-11-25");
  });

  it("names the card on a payment row only when more than one card has dates", () => {
    const withoutDays = card({ applicationId: CHIME_ID, name: "Chime", statementClosingDay: null, paymentDueDay: null });
    const rows = comingUpRows({ today: "2026-11-09", cards: [card(), withoutDays], bills: [] });
    expect(rows.find((row) => row.title.endsWith("Payment due"))?.subtitle).toBe("Autopay is off. Set it up");
  });

  it("never says autopay is off when the student has not said", () => {
    const [due] = comingUpRows({ today: "2026-11-09", cards: [card({ statementClosingDay: null, autopayStatus: "unknown" })], bills: [] });
    expect(due.subtitle).toBe("Turn on autopay");
    const [on] = comingUpRows({ today: "2026-11-09", cards: [card({ statementClosingDay: null, autopayStatus: "on" })], bills: [] });
    expect(on.subtitle).toBe("Autopay is on");
  });

  it("lists only the bills the student pays that have a due day", () => {
    const bills: BillAnswer[] = [
      rent(15),
      { bill: "phone", coveredBy: "split", monthlyCents: 4_000, dueDay: 12 },
      // Tuition is asked per semester and has no due day.
      { bill: "tuition", coveredBy: "me", monthlyCents: 100_000, dueDay: null },
      { bill: "groceries", coveredBy: "family", monthlyCents: null, dueDay: null },
      { bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null },
    ];
    const rows = comingUpRows({ today: "2026-11-09", cards: [], bills });
    expect(rows.map(({ title, subtitle }) => [title, subtitle])).toEqual([
      ["Nov 12  Phone, $40", "Your share · you typed this"],
      ["Nov 15  Rent, $650", "You cover it · you typed this"],
    ]);
  });

  it("never lists groceries, even ones the student pays with a due day: they sit outside safe to spend", () => {
    const groceries = (coveredBy: "me" | "split"): BillAnswer => ({ bill: "groceries", coveredBy, monthlyCents: 20_000, dueDay: 10 });
    for (const coveredBy of ["me", "split"] as const) {
      expect(comingUp({ today: "2026-11-09", cards: [], bills: [groceries(coveredBy)] })).toEqual([]);
      const rows = comingUpRows({ today: "2026-11-09", cards: [], bills: [groceries(coveredBy), rent(15)] });
      expect(rows.map((row) => row.title)).toEqual(["Nov 15  Rent, $650"]);
    }
  });

  it("leaves out a bill of $0", () => {
    expect(comingUp({ today: "2026-11-09", cards: [], bills: [rent(15, { monthlyCents: 0 })] })).toEqual([]);
  });

  it("with no bank linked, lists the cards' dates alone", () => {
    expect(dates(comingUp({ today: "2026-11-09", cards: [card()], bills: [] }))).toEqual([
      "statement_closes 2026-11-13",
      "payment_due 2026-12-06",
    ]);
  });

  it("is empty with no cards and no bills, and with cards that have no dates yet", () => {
    expect(comingUpRows({ today: "2026-11-09", cards: [], bills: [] })).toEqual([]);
    expect(comingUpRows({ today: "2026-11-09", cards: [card({ statementClosingDay: null, paymentDueDay: null })], bills: [] })).toEqual([]);
  });

  it("skips a day that is not 1 to 31 instead of failing Home", () => {
    for (const day of [0, 32, 1.5]) {
      expect(comingUp({ today: "2026-11-09", cards: [card({ statementClosingDay: day, paymentDueDay: day })], bills: [rent(day)] })).toEqual([]);
    }
  });

  it("says only the card's name before the close when the limit is unknown", () => {
    const [close] = comingUpRows({ today: "2026-11-09", cards: [card({ creditLimitCents: null, paymentDueDay: null })], bills: [] });
    expect(close).toMatchObject({ subtitle: "Discover", sensitive: false });
  });
});

describe("comingUpRow links", () => {
  it("opens where each date is set or acted on", () => {
    const rows = comingUpRows({
      today: "2026-11-09",
      cards: [card()],
      bills: [rent(15)],
      paychecks: [{ date: "2026-11-20", amountCents: 48_000 }],
    });
    expect(rows.map((row) => [row.title, row.href, row.sensitive])).toEqual([
      ["Nov 13  Statement closes", `/applications/${DISCOVER_ID}/reminders`, true],
      ["Nov 15  Rent, $650", "/safe-to-spend", true],
      ["Nov 20  Paycheck, $480", "/safe-to-spend", true],
      // Autopay not on: straight to the issuer's autopay steps ("Set it up").
      ["Dec 6  Payment due", `/applications/${DISCOVER_ID}/setup/autopay`, false],
    ]);
    const [unknown] = comingUpRows({ today: "2026-11-09", cards: [card({ statementClosingDay: null, autopayStatus: "unknown" })], bills: [] });
    expect(unknown).toMatchObject({ subtitle: "Turn on autopay", href: `/applications/${DISCOVER_ID}/setup/autopay` });
    const [on] = comingUpRows({ today: "2026-11-09", cards: [card({ statementClosingDay: null, autopayStatus: "on" })], bills: [] });
    expect(on.href).toBe(`/applications/${DISCOVER_ID}/reminders`);
  });

  it("gives every row its own key", () => {
    const rows = comingUpRows({ today: "2027-01-30", cards: [card({ statementClosingDay: 30, paymentDueDay: 31 })], bills: [rent(30)] });
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

describe("comingUpCardNames", () => {
  it("uses the brand students know, unless two cards share it or the card is not in the catalog", () => {
    const names = comingUpCardNames([
      { applicationId: "a", cardName: "Discover it Student Cash Back", brand: "Discover" },
      { applicationId: "b", cardName: "Savor Rewards for Students", brand: "Capital One" },
      { applicationId: "c", cardName: "Quicksilver Rewards for Students", brand: "Capital One" },
      { applicationId: "d", cardName: "My credit union card", brand: null },
    ]);
    expect([...names.values()]).toEqual(["Discover", "Savor Rewards for Students", "Quicksilver Rewards for Students", "My credit union card"]);
  });
});
