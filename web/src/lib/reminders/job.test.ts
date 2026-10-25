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
});
