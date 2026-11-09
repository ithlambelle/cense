import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);
const send = vi.hoisted(() => ({ sendPaymentRemindersConfirmation: vi.fn(async () => "sent" as const) }));
vi.mock("@/lib/reminders/send-confirmation", () => send);

import { POST } from "./route";

const ID = "00000000-0000-4000-8000-000000000001";
type Result = { data: unknown; error: { code?: string; message: string } | null };

const card = (over: Record<string, unknown> = {}) => ({
  status: "approved", card_name: "Discover it Student Cash", statement_closing_day: 12, payment_due_day: 7,
  autopay_status: "off", ...over,
});
const settings = (over: Record<string, unknown> = {}) => ({
  time_zone: "America/New_York", remind_statement_closing: true, remind_payment_due: true, ...over,
});

// Each table's read answers its own result.
function student(cardResult: Result, profileResult: Result = { data: settings(), error: null }) {
  const chain = (answer: Result) => {
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq"]) query[name] = () => query;
    query.maybeSingle = async () => answer;
    return query;
  };
  const supabase = { from: (table: string) => chain(table === "profiles" ? profileResult : cardResult) };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: "student@example.edu" });
}

const post = (id = ID) => POST(new Request("http://test", { method: "POST" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  // Monday Nov 9 2026, 10:00 in New York.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
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

  it("names each reminder that is on with the day it goes out, from what is saved", async () => {
    student({ data: card(), error: null });
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ confirmation: "sent" });
    // Closes the 12th: reminded today, 3 days before. Due the 7th: Dec 7, so Dec 4.
    expect(send.sendPaymentRemindersConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student-1" }),
      {
        applicationId: ID, cardName: "Discover it Student Cash", today: "2026-11-09",
        statementClosing: { remindOn: "2026-11-09" }, paymentDue: { remindOn: "2026-12-04" }, autopayOn: false,
      },
      { statementClosingDay: 12, paymentDueDay: 7 },
    );
  });

  it("leaves out the due-date email while autopay is on, and any email the student turned off", async () => {
    student({ data: card({ autopay_status: "on" }), error: null });
    await post();
    expect(send.sendPaymentRemindersConfirmation).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ statementClosing: { remindOn: "2026-11-09" }, paymentDue: null, autopayOn: true }),
      expect.anything(),
    );

    student({ data: card(), error: null }, { data: settings({ remind_statement_closing: false }), error: null });
    await post();
    expect(send.sendPaymentRemindersConfirmation).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ statementClosing: null, paymentDue: { remindOn: "2026-12-04" } }),
      expect.anything(),
    );
  });

  it("sends nothing when no reminder is on for this card", async () => {
    student({ data: card({ autopay_status: "on" }), error: null }, { data: settings({ remind_statement_closing: false }), error: null });
    expect(await (await post()).json()).toEqual({ confirmation: "skipped" });
    student({ data: card(), error: null }, { data: settings({ remind_statement_closing: false, remind_payment_due: false }), error: null });
    expect(await (await post()).json()).toEqual({ confirmation: "skipped" });
    expect(send.sendPaymentRemindersConfirmation).not.toHaveBeenCalled();
  });

  it("answers 503 when the database read fails", async () => {
    student({ data: null, error: { code: "08006", message: "down" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post()).status).toBe(503);
  });
});
