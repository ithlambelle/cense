import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ServiceClient } from "@/lib/supabase/service";

import { runReminderJob } from "./job";

const config = { resendApiKey: "re_test_fake", fromEmail: "Cense <r@example.test>", appUrl: "https://app.test", unsubscribeSecret: "test-secret" }; // gitleaks:allow
const row = (n: number) => ({
  reminder_id: `00000000-0000-4000-8000-00000000000${n}`, student_id: `00000000-0000-4000-8000-0000000000b${n}`,
  kind: "payment_due", occurrence: "2026-12-09", email: `s${n}@example.test`, card_id: null, card_name: "Card",
  credit_limit_cents: null, autopay_status: "on", payment_due_day: 9, time_zone: "America/New_York",
});

// profiles.analytics_opted_out_at for the students the job reads, by id; a
// missing id has no profile row. reads counts the profile queries.
type Profiles = Record<string, string | null> | { error: { code: string } };
function profiles(rows: Profiles = {}) {
  const reads: { table: string; ids: string[] }[] = [];
  const from = (table: string) => ({
    select: () => ({
      in: async (_column: string, ids: string[]) => {
        reads.push({ table, ids });
        if ("error" in rows) return { data: null, error: rows.error };
        return {
          data: ids.filter((id) => id in rows).map((id) => ({ student_id: id, analytics_opted_out_at: (rows as Record<string, string | null>)[id] })),
          error: null,
        };
      },
    }),
  });
  return { from, reads };
}

function sentAll(n: number, rows: Profiles) {
  const { from, reads } = profiles(rows);
  const supabase = {
    rpc: async (name: string) => {
      if (name === "claim_due_reminders") return { data: Array.from({ length: n }, (_, i) => row(i + 1)), error: null };
      return { data: name === "mark_reminder_sent" ? true : null, error: null };
    },
    from,
  } as unknown as ServiceClient;
  const fetchMock = vi.fn(async () => Response.json({ id: "x" }));
  return { supabase, reads, fetchMock };
}

describe("runReminderJob", () => {
  it("spaces sends for Resend's rate limit and releases what is left when time runs out", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const calls: string[] = [];
    const supabase = {
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "claim_due_reminders") return { data: [row(1), row(2), row(3)], error: null };
        return { data: name === "mark_reminder_sent" ? true : null, error: null };
      },
      from: profiles().from,
    } as unknown as ServiceClient;
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => { clock += ms; });
    const fetchMock = vi.fn(async () => { clock += 30_000; return Response.json({ id: "x" }); });

    const result = await runReminderJob(supabase, config, { fetch: fetchMock as unknown as typeof fetch, sleep, now: () => clock });
    expect(result).toEqual({ claimed: 3, sent: 2, failed: 0, unconfirmed: 0, deferred: 1, abandoned: 0 });
    expect(sleep).toHaveBeenCalledWith(550);
    expect(calls.filter((name) => name === "release_reminder_claim")).toHaveLength(1);
  });

  it("copies each reminder marked sent to analytics, with its row id, and nothing about the student but the id", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const marked = [true, null];
    const supabase = {
      rpc: async (name: string) => {
        if (name === "claim_due_reminders") return { data: [row(1), row(2), row(3)], error: null };
        if (name === "mark_reminder_sent") return { data: marked.shift() ?? null, error: null };
        return { data: null, error: null };
      },
      from: profiles({ [row(1).student_id]: null, [row(2).student_id]: null }).from,
    } as unknown as ServiceClient;
    // the first two go out, the third fails
    const answers = [Response.json({ id: "a" }), Response.json({ id: "b" }), Response.json({ name: "application_error" }, { status: 500 })];
    const fetchMock = vi.fn(async () => answers.shift()!);
    const capture = vi.fn(async () => {});

    const result = await runReminderJob(supabase, config, { fetch: fetchMock as unknown as typeof fetch, sleep: async () => {}, capture });
    // the second was sent but could not be marked: not a sent row yet, so not copied
    expect(result).toMatchObject({ sent: 1, unconfirmed: 1, failed: 1 });
    expect(capture).toHaveBeenCalledWith([
      { event: "reminder_sent", studentId: row(1).student_id, properties: { kind: "payment_due" }, uuid: row(1).reminder_id },
    ]);
  });

  it("copies reminder_sent only for students whose Analytics switch is on, in one profile read", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    // row 1 is on, row 2 turned analytics off, row 3 has no profile row
    const { supabase, reads, fetchMock } = sentAll(3, { [row(1).student_id]: null, [row(2).student_id]: "2026-10-25T12:00:00.000Z" });
    const capture = vi.fn(async () => {});

    const result = await runReminderJob(supabase, config, { fetch: fetchMock as unknown as typeof fetch, sleep: async () => {}, capture });
    expect(result).toMatchObject({ sent: 3, failed: 0 });
    expect(reads).toEqual([{ table: "profiles", ids: [row(1).student_id, row(2).student_id, row(3).student_id] }]);
    expect(capture).toHaveBeenCalledWith([
      { event: "reminder_sent", studentId: row(1).student_id, properties: { kind: "payment_due" }, uuid: row(1).reminder_id },
    ]);
  });

  it("sends no reminder_sent when the Analytics switch cannot be read, and still sends every email", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { supabase, fetchMock } = sentAll(2, { error: { code: "PGRST000" } });
    const capture = vi.fn(async () => {});

    const result = await runReminderJob(supabase, config, { fetch: fetchMock as unknown as typeof fetch, sleep: async () => {}, capture });
    expect(result).toMatchObject({ claimed: 2, sent: 2, failed: 0, unconfirmed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(capture).not.toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("analytics_consent_read_failed"));
  });
});
