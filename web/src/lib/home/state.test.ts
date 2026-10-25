import { describe, expect, it } from "vitest";

import type { Application } from "../api/application";
import { listCards } from "../cards/catalog";
import { computeResult } from "../results/compute";
import {
  cardApplication,
  celebrating,
  homeState,
  needsDetail,
  paymentReminderOn,
  planApplication,
  profileInitial,
  reminderStatus,
} from "./state";

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
const cards = listCards();

function app(id: string, status: Application["status"], statusUpdatedAt: string): Application {
  return {
    id: `00000000-0000-4000-8000-00000000000${id}`,
    cardId: null,
    cardName: `Card ${id}`,
    status,
    creditLimitCents: null,
    appliedAt: null,
    statusUpdatedAt,
  };
}

describe("homeState", () => {
  it("asks for the quiz when nothing is saved, and says when some answers are", () => {
    expect(homeState([], computeResult(undefined, cards), false)).toEqual({ kind: "no_quiz", started: false });
    expect(homeState([], computeResult({ under21: true }, cards), true)).toEqual({ kind: "no_quiz", started: true });
  });

  it("shows the match when the quiz is done and nothing is tracked", () => {
    const state = homeState([], computeResult(ALL_SIX, cards), true);
    expect(state.kind).toBe("matched");
  });

  it("shows no card with the rules' reason when none fits", () => {
    const state = homeState([], computeResult({ ...ALL_SIX, incomeBand: "none" }, cards), true);
    expect(state.kind).toBe("no_card");
    if (state.kind === "no_card") expect(state.reason).toContain("under 21");
  });

  it("puts tracked cards ahead of the quiz, newest change first", () => {
    const older = app("1", "approved", "2026-10-01T00:00:00Z");
    const newer = app("2", "rejected", "2026-10-10T00:00:00Z");
    const state = homeState([older, newer], computeResult(ALL_SIX, cards), true);
    expect(state).toEqual({ kind: "tracking", primary: newer, others: [older] });
  });

  it("treats a card the student already had like any approved card", () => {
    const added = { ...app("3", "approved", "2026-10-05T00:00:00Z"), creditLimitCents: 50000 };
    const state = homeState([added], computeResult(undefined, cards), false);
    expect(state).toEqual({ kind: "tracking", primary: added, others: [] });
  });
});

describe("planApplication", () => {
  const older = app("1", "approved", "2026-10-01T00:00:00Z");
  const newer = app("2", "approved", "2026-10-10T00:00:00Z");
  const denied = app("3", "rejected", "2026-10-12T00:00:00Z");

  it("opens the approved card that was asked for, even when it is not the newest", () => {
    expect(planApplication([newer, older, denied], older.id)).toBe(older);
  });

  it("falls back to the most recently approved card when none, or no valid one, is asked for", () => {
    expect(planApplication([older, denied, newer], null)).toBe(newer);
    expect(planApplication([older, newer], "00000000-0000-4000-8000-000000000999")).toBe(newer);
  });

  it("never opens a plan for a card that is not approved", () => {
    expect(planApplication([older, denied], denied.id)).toBe(older);
    expect(planApplication([denied], denied.id)).toBeNull();
    expect(planApplication([], null)).toBeNull();
  });
});

describe("cardApplication", () => {
  const forCard = (application: Application) => ({ ...application, cardId: "discover-it-student-cash-back" });
  const older = forCard(app("1", "applied", "2026-10-10T00:00:00Z"));
  const newer = forCard(app("2", "approved", "2026-10-12T00:00:00Z"));
  const denied = forCard(app("3", "rejected", "2026-10-14T00:00:00Z"));
  const other = app("4", "applied", "2026-10-15T00:00:00Z");

  it("picks the most recently changed application for the card that is still open to update", () => {
    expect(cardApplication([older, denied, newer, other], "discover-it-student-cash-back")).toBe(newer);
  });

  it("falls back to a denied one, and is null for a card the student does not track", () => {
    expect(cardApplication([denied, other], "discover-it-student-cash-back")).toBe(denied);
    expect(cardApplication([other], "discover-it-student-cash-back")).toBeNull();
  });
});

describe("celebrating", () => {
  const none = computeResult(undefined, cards);
  it("celebrates only the approved card Home leads with, named by the flag", () => {
    const newest = app("1", "approved", "2026-10-22T00:00:00Z");
    const state = homeState([newest, app("2", "approved", "2026-10-01T00:00:00Z")], none, true);
    expect(celebrating(state, newest.id)).toBe(true);
    expect(celebrating(state, null)).toBe(false);
    expect(celebrating(state, "00000000-0000-4000-8000-000000000002")).toBe(false);
    expect(celebrating(homeState([app("1", "applied", "2026-10-22T00:00:00Z")], none, true), newest.id)).toBe(false);
  });
});

describe("profileInitial", () => {
  it("uses the email's first letter, uppercase, until a name is saved", () => {
    expect(profileInitial("maya@bu.edu")).toBe("M");
    expect(profileInitial(null)).toBe("");
  });
});

describe("needsDetail", () => {
  it("reads the denial reason and autopay only for an approved or denied leading card", () => {
    const none = computeResult(undefined, cards);
    expect(needsDetail(homeState([app("1", "approved", "2026-10-01T00:00:00Z")], none, true))).toBe(true);
    expect(needsDetail(homeState([app("2", "rejected", "2026-10-01T00:00:00Z")], none, true))).toBe(true);
    expect(needsDetail(homeState([app("3", "applied", "2026-10-01T00:00:00Z")], none, true))).toBe(false);
    expect(needsDetail(homeState([], none, false))).toBe(false);
  });
});

describe("paymentReminderOn", () => {
  it("needs the due day saved, the due-date email on and emails not off", () => {
    const on = { paymentDue: true, emailsOn: true };
    expect(paymentReminderOn({ paymentDueDay: 9 }, on)).toBe(true);
    expect(paymentReminderOn({ paymentDueDay: null }, on)).toBe(false);
    expect(paymentReminderOn(null, on)).toBe(false);
    expect(paymentReminderOn({ paymentDueDay: 9 }, { ...on, paymentDue: false })).toBe(false);
    expect(paymentReminderOn({ paymentDueDay: 9 }, { ...on, emailsOn: false })).toBe(false);
  });
});

describe("reminderStatus", () => {
  const all = { emailsOn: true, statementClosing: true, paymentDue: true };
  it("is not set until both days are saved, then on while either email is", () => {
    expect(reminderStatus({ statementClosingDay: null, paymentDueDay: 9 }, all)).toBe("not_set");
    expect(reminderStatus({ statementClosingDay: 14, paymentDueDay: 9 }, all)).toBe("on");
    expect(reminderStatus({ statementClosingDay: 14, paymentDueDay: 9 }, { ...all, paymentDue: false })).toBe("on");
    expect(reminderStatus({ statementClosingDay: 14, paymentDueDay: 9 }, { ...all, paymentDue: false, statementClosing: false })).toBe("off");
    expect(reminderStatus({ statementClosingDay: 14, paymentDueDay: 9 }, { ...all, emailsOn: false })).toBe("off");
  });
});
