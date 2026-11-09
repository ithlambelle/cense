import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Reminder } from "@/lib/api/reminders";
import type { ReminderCard } from "@/lib/reminders/in-app";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);
const data = vi.hoisted(() => ({ loadOneReminder: vi.fn() }));
vi.mock("@/lib/reminders/in-app-data", () => data);

import { POST } from "./route";

const REM = "00000000-0000-4000-8000-0000000000a1";
const APP = "00000000-0000-4000-8000-000000000001";
const NY = "America/New_York";
type Result = { data: unknown; error: { code?: string; message: string } | null };

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: REM, applicationId: APP, kind: "statement_closing", occurrence: "2026-11-13", remindOn: "2026-11-10",
  dueAt: "2026-11-10T14:00:00.000Z", sentAt: "2026-11-08T22:30:00.000Z", actedAt: null, readAt: null,
  snoozedUntil: null, dismissedAt: null, followUpAt: null, createdAt: "2026-11-01T15:00:00.000Z", ...over,
});
const card: ReminderCard = { cardName: "Discover it", creditLimitCents: 50_000, paymentDueDay: 6, autopayStatus: "off" };
const row = (over: Record<string, unknown> = {}) => ({
  id: REM, card_application_id: APP, kind: "statement_closing", occurrence: "2026-11-13", due_at: "2026-11-10T14:00:00+00:00",
  sent_at: "2026-11-08T22:30:00+00:00", acted_at: null, read_at: null, snoozed_until: "2026-11-09T14:00:00+00:00",
  dismissed_at: null, follow_up_at: null, created_at: "2026-11-01T15:00:00+00:00", ...over,
});

// The student's session, whose rpc answers `rpcResult` and records its calls.
function student(found: Reminder | null = reminder(), rpcResult: Result = { data: row(), error: null }) {
  const calls: { name: string; args: unknown }[] = [];
  const supabase = { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return rpcResult; } };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  data.loadOneReminder.mockResolvedValue(found && { reminder: found, card, timeZone: NY });
  return calls;
}

const snooze = (body: unknown, id = REM) =>
  POST(new Request("http://test", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const code = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Sunday Nov 8 2026, 18:00 in New York.
  vi.setSystemTime(new Date("2026-11-08T23:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
  data.loadOneReminder.mockReset();
});

describe("POST /reminders/{id}/snooze", () => {
  it("snoozes to 9:00 on the student's calendar, worked out by the server", async () => {
    const calls = student();
    const response = await snooze({ choice: "tomorrow" });
    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: "snooze_reminder", args: { p_reminder_id: REM, p_until: "2026-11-09T14:00:00.000Z" } }]);
    expect(await response.json()).toMatchObject({ id: REM, snoozedUntil: "2026-11-09T14:00:00.000Z" });
  });

  it("needs a session", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await snooze({ choice: "tomorrow" })).status).toBe(401);
  });

  it("refuses a bad id or choice before reading", async () => {
    const calls = student();
    expect((await snooze({ choice: "tomorrow" }, "nope")).status).toBe(400);
    expect((await snooze({ choice: "next_year" })).status).toBe(400);
    expect((await snooze({})).status).toBe(400);
    expect(data.loadOneReminder).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("answers 404 for a reminder that is not theirs, and 503 when it cannot be read", async () => {
    student(null);
    expect((await snooze({ choice: "tomorrow" })).status).toBe(404);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student();
    data.loadOneReminder.mockRejectedValue(new Error("down"));
    expect((await snooze({ choice: "tomorrow" })).status).toBe(503);
  });

  it("refuses an unsent reminder (409 not_sent) and a done one (409 closed)", async () => {
    const calls = student(reminder({ sentAt: null }));
    const unsent = await snooze({ choice: "tomorrow" });
    expect(unsent.status).toBe(409);
    expect(await code(unsent)).toBe("not_sent");
    student(reminder({ actedAt: "2026-11-08T22:40:00.000Z" }));
    expect(await code(await snooze({ choice: "tomorrow" }))).toBe("closed");
    student(reminder({ dismissedAt: "2026-11-08T22:40:00.000Z" }));
    expect(await code(await snooze({ choice: "tomorrow" }))).toBe("closed");
    expect(calls).toEqual([]);
  });

  it("refuses a time past the due date (409 past_due) without calling the database", async () => {
    // Closes tomorrow: only tomorrow morning is left.
    const calls = student(reminder({ occurrence: "2026-11-09" }));
    const late = await snooze({ choice: "in_2_days" });
    expect(late.status).toBe(409);
    expect(await code(late)).toBe("past_due");
    expect(calls).toEqual([]);
  });

  it("maps the database's refusals", async () => {
    student(reminder(), { data: null, error: { code: "P0002", message: "missing" } });
    expect((await snooze({ choice: "tomorrow" })).status).toBe(404);
    student(reminder(), { data: null, error: { code: "55000", message: "closed" } });
    expect(await code(await snooze({ choice: "tomorrow" }))).toBe("closed");
    student(reminder(), { data: null, error: { code: "22023", message: "past" } });
    expect(await code(await snooze({ choice: "tomorrow" }))).toBe("past_due");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student(reminder(), { data: null, error: { code: "PGRST000", message: "down" } });
    expect((await snooze({ choice: "tomorrow" })).status).toBe(503);
  });
});
