import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);
const send = vi.hoisted(() => ({ sendPaymentRemindersConfirmation: vi.fn(async () => "sent" as "sent" | "failed") }));
vi.mock("@/lib/reminders/send-confirmation", () => send);

import { POST } from "./route";

const ID = "00000000-0000-4000-8000-000000000001";
const SAVED_AT = "2026-11-09T15:00:00.123456+00:00";
type Result = { data: unknown; error: { code?: string; message: string } | null };

const card = (over: Record<string, unknown> = {}) => ({
  status: "approved", source: "application", card_name: "Discover it Student Cash", statement_closing_day: 20,
  payment_due_day: 15, autopay_status: "off", updated_at: SAVED_AT, ...over,
});
const settings = (over: Record<string, unknown> = {}) => ({
  time_zone: "America/New_York", remind_statement_closing: true, remind_payment_due: true, remind_check_autopay: true, ...over,
});
// What refresh_reminders scheduled for a new card set up Nov 9, closing the
// 20th and due the 15th: the first due date is the one after the first close
// (Dec 15), not Nov 15. Earliest first, as the route reads them.
const SCHEDULED = [
  { kind: "statement_closing", occurrence: "2026-11-20" },
  { kind: "check_autopay", occurrence: "2026-11-21" },
  { kind: "payment_due", occurrence: "2026-12-15" },
];

// Each table answers its own result; the reminders read records its filters.
let reminderFilters: string[] = [];
function student(cardResult: Result, profileResult: Result = { data: settings(), error: null }, remindersResult: Result = { data: SCHEDULED, error: null }) {
  reminderFilters = [];
  const single = (answer: Result) => {
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq"]) query[name] = () => query;
    query.maybeSingle = async () => answer;
    return query;
  };
  const list = () => {
    const query: Record<string, unknown> = {
      then: (resolve: (value: Result) => unknown) => Promise.resolve(remindersResult).then(resolve),
    };
    for (const name of ["select", "eq", "in", "is", "order"]) {
      query[name] = (...args: unknown[]) => { reminderFilters.push(`${name}:${JSON.stringify(args)}`); return query; };
    }
    return query;
  };
  const supabase = {
    from: (table: string) => (table === "reminders" ? list() : single(table === "profiles" ? profileResult : cardResult)),
  };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: "student@example.edu" });
}

const post = (id = ID) => POST(new Request("http://test", { method: "POST" }), { params: Promise.resolve({ id }) });
const lastInput = () => (send.sendPaymentRemindersConfirmation.mock.calls.at(-1) as unknown[])[1];

beforeEach(() => {
  // Monday Nov 9 2026, 10:00 in New York.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("POST /applications/{id}/reminder-confirmation", () => {
  it("needs a signed-in student and a valid card ID", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    student({ data: card(), error: null });
    expect((await post("not-a-uuid")).status).toBe(400);
  });

  it("answers 404 for a card that is not the student's", async () => {
    student({ data: null, error: null });
    expect((await post()).status).toBe(404);
  });

  it("answers 409 until the card is approved and both days are saved", async () => {
    for (const over of [{ status: "applied" }, { statement_closing_day: null }, { payment_due_day: null }]) {
      student({ data: card(over), error: null });
      expect((await post()).status).toBe(409);
    }
    expect(send.sendPaymentRemindersConfirmation).not.toHaveBeenCalled();
  });

  it("reads the reminders the database scheduled for this card, unsent, and names their dates", async () => {
    student({ data: card(), error: null });
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ confirmation: "sent" });
    expect(reminderFilters).toEqual(expect.arrayContaining([
      `eq:["card_application_id","${ID}"]`,
      `eq:["student_id","student-1"]`,
      `is:["sent_at",null]`,
    ]));
    expect(send.sendPaymentRemindersConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student-1" }),
      {
        applicationId: ID, cardName: "Discover it Student Cash", today: "2026-11-09",
        statementClosing: "2026-11-20", paymentDue: "2026-12-15", autopayCheck: true, autopayOn: false,
      },
      SAVED_AT,
    );
  });

  it("keeps only what the daily job would send: switches, autopay, and the check only for a card got through Cense", async () => {
    student({ data: card({ autopay_status: "on" }), error: null });
    await post();
    expect(lastInput()).toMatchObject({ statementClosing: "2026-11-20", paymentDue: null, autopayCheck: false, autopayOn: true });

    student({ data: card({ source: "added" }), error: null });
    await post();
    expect(lastInput()).toMatchObject({ autopayCheck: false, paymentDue: "2026-12-15" });

    student({ data: card(), error: null }, { data: settings({ remind_statement_closing: false, remind_check_autopay: false }), error: null });
    await post();
    expect(lastInput()).toMatchObject({ statementClosing: null, paymentDue: "2026-12-15", autopayCheck: false });
  });

  it("sends nothing when no reminder is on for this card", async () => {
    student({ data: card({ autopay_status: "on" }), error: null }, { data: settings({ remind_statement_closing: false }), error: null });
    expect(await (await post()).json()).toEqual({ confirmation: "skipped" });
    student({ data: card(), error: null }, { data: settings(), error: null }, { data: [], error: null });
    expect(await (await post()).json()).toEqual({ confirmation: "skipped" });
    expect(send.sendPaymentRemindersConfirmation).not.toHaveBeenCalled();
  });

  it("passes a failed send on, and answers 503 when a read fails", async () => {
    student({ data: card(), error: null });
    send.sendPaymentRemindersConfirmation.mockResolvedValueOnce("failed");
    expect(await (await post()).json()).toEqual({ confirmation: "failed" });

    vi.spyOn(console, "error").mockImplementation(() => {});
    student({ data: null, error: { code: "08006", message: "down" } });
    expect((await post()).status).toBe(503);
    student({ data: card(), error: null }, { data: null, error: { code: "08006", message: "down" } });
    expect((await post()).status).toBe(503);
    student({ data: card(), error: null }, { data: settings(), error: null }, { data: null, error: { code: "08006", message: "down" } });
    expect((await post()).status).toBe(503);
  });
});
