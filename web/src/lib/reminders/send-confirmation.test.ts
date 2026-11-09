import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Student } from "@/lib/api/auth";

import { sendReapplyConfirmation } from "./send-confirmation";

const ENV = {
  RESEND_API_KEY: "test-key",
  REMINDER_FROM_EMAIL: "Cense <reminders@example.test>",
  APP_BASE_URL: "http://localhost:3300",
  REMINDER_UNSUBSCRIBE_SECRET: "test-secret",
  RESEND_BASE_URL: "http://127.0.0.1:3598",
};
const REMINDER = { id: "00000000-0000-4000-8000-0000000000a1", applicationId: "00000000-0000-4000-8000-000000000001", remindOn: "2027-04-05" };

function student(unsubscribedAt: string | null = null, email: string | null = "student@example.edu"): Student {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { reminders_unsubscribed_at: unsubscribedAt }, error: null }) };
  return { supabase: { from: () => query }, studentId: "student-1", email } as unknown as Student;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubEnv() {
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
}

describe("sendReapplyConfirmation", () => {
  it("sends one email through Resend, keyed to the reminder and its day", async () => {
    stubEnv();
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ id: "1" }));
    expect(await sendReapplyConfirmation(student(), REMINDER, fetchFn)).toBe("sent");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3598/emails");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe(`reapply-confirmation-${REMINDER.id}-2027-04-05`);
    const body = JSON.parse(String(init?.body));
    expect(body.to).toEqual(["student@example.edu"]);
    expect(body.subject).toBe("Your reapply reminder is set");
  });

  it("skips it when reminder emails are off, the settings are missing, or there is no address", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await sendReapplyConfirmation(student(), REMINDER, fetchFn)).toBe("skipped");
    stubEnv();
    expect(await sendReapplyConfirmation(student("2026-11-01T00:00:00Z"), REMINDER, fetchFn)).toBe("skipped");
    expect(await sendReapplyConfirmation(student(null, null), REMINDER, fetchFn)).toBe("skipped");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("never throws: a failed send is logged without the address", async () => {
    stubEnv();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ name: "validation_error" }, { status: 422 }));
    expect(await sendReapplyConfirmation(student(), REMINDER, fetchFn)).toBe("failed");
    const thrown = vi.fn<typeof fetch>(async () => {
      throw new TypeError("offline");
    });
    expect(await sendReapplyConfirmation(student(), REMINDER, thrown)).toBe("failed");
    expect(JSON.stringify(error.mock.calls)).not.toContain("student@example.edu");
  });
});
