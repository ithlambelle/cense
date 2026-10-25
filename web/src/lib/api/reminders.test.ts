import { describe, expect, it } from "vitest";

import { calendarDate, reminderFromRow, safeTimeZone } from "./reminders";

describe("safeTimeZone", () => {
  it("keeps a real time zone and falls back to New York otherwise", () => {
    expect(safeTimeZone("Asia/Seoul")).toBe("Asia/Seoul");
    expect(safeTimeZone("Eastern")).toBe("America/New_York");
    expect(safeTimeZone("")).toBe("America/New_York");
    expect(safeTimeZone(null)).toBe("America/New_York");
  });
});

describe("calendarDate", () => {
  it("is the day on the student's calendar, not in UTC", () => {
    // 9:00 New York on Nov 9 is 14:00 UTC; 01:00 UTC Nov 10 is still Nov 9 in New York.
    expect(calendarDate("2026-11-09T14:00:00Z", "America/New_York")).toBe("2026-11-09");
    expect(calendarDate("2026-11-10T01:00:00Z", "America/New_York")).toBe("2026-11-09");
    expect(calendarDate("2026-11-10T01:00:00Z", "Asia/Seoul")).toBe("2026-11-10");
  });
});

describe("reminderFromRow", () => {
  it("maps a row to the API shape", () => {
    expect(reminderFromRow({
      id: "00000000-0000-4000-8000-0000000000a1",
      card_application_id: "00000000-0000-4000-8000-000000000001",
      kind: "statement_closing",
      occurrence: "2026-11-12",
      due_at: "2026-11-09T14:00:00+00:00",
      sent_at: null,
      acted_at: null,
      created_at: "2026-11-01T15:00:00+00:00",
    }, "America/New_York")).toEqual({
      id: "00000000-0000-4000-8000-0000000000a1",
      applicationId: "00000000-0000-4000-8000-000000000001",
      kind: "statement_closing",
      occurrence: "2026-11-12",
      remindOn: "2026-11-09",
      dueAt: "2026-11-09T14:00:00.000Z",
      sentAt: null,
      actedAt: null,
      createdAt: "2026-11-01T15:00:00.000Z",
    });
  });
});
