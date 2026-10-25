import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const service = vi.hoisted(() => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => service);

import { verifyUnsubscribeToken } from "@/lib/reminders/unsubscribe-token";

import { GET } from "./route";

// Obvious fakes, never real keys.
const ENV = {
  CRON_SECRET: "test-cron-secret", // gitleaks:allow
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key", // gitleaks:allow
  RESEND_API_KEY: "re_test_fake", // gitleaks:allow
  REMINDER_FROM_EMAIL: "Cense <reminders@send.example.test>",
  REMINDER_UNSUBSCRIBE_SECRET: "test-unsubscribe-secret", // gitleaks:allow
  APP_BASE_URL: "https://app.test/",
};
const STUDENT = "00000000-0000-4000-8000-0000000000aa";
type Result = { data: unknown; error: { code?: string; message: string } | null };

const claimed = (over: Record<string, unknown> = {}) => ({
  reminder_id: "00000000-0000-4000-8000-0000000000a1", student_id: STUDENT, kind: "statement_closing",
  occurrence: "2026-11-12", email: "student@example.test", card_id: "capital-one-savor-students", card_name: null,
  credit_limit_cents: 50_000, autopay_status: "off", payment_due_day: 9, time_zone: "America/New_York", ...over,
});

// The service client: each rpc name answers from its own queue (or ok/null).
function database(answers: Record<string, Result[]> = {}) {
  const calls: { name: string; args?: unknown }[] = [];
  service.createServiceClient.mockReturnValue({
    rpc: async (name: string, args?: unknown) => {
      calls.push({ name, args });
      return answers[name]?.shift() ?? { data: name === "mark_reminder_sent" ? true : null, error: null };
    },
  });
  return calls;
}

function resend(...responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift() ?? Response.json({ id: "email-id" }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const cron = (authorization: string | null = `Bearer ${ENV.CRON_SECRET}`) =>
  GET(new Request("https://app.test/api/v1/cron/reminders", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  service.createServiceClient.mockReset();
});

describe("GET /cron/reminders", () => {
  it("refuses a missing or wrong secret, and everything when no secret is set", async () => {
    const calls = database();
    expect((await cron(null)).status).toBe(401);
    expect((await cron("Bearer wrong")).status).toBe(401);
    expect((await cron(ENV.CRON_SECRET)).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron("Bearer ")).status).toBe(401);
    expect((await cron(`Bearer ${ENV.CRON_SECRET}`)).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("names a missing setting in the log and stops", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const calls = database();
    const response = await cron();
    expect(response.status).toBe(500);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain("RESEND_API_KEY");
    expect(calls).toEqual([]);
  });

  it("refreshes, claims, sends through Resend and marks sent, answering with counts only", async () => {
    const calls = database({ claim_due_reminders: [{ data: [claimed()], error: null }] });
    const fetchMock = resend();

    const response = await cron();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ claimed: 1, sent: 1, failed: 0, unconfirmed: 0, deferred: 0 });
    expect(calls.map((call) => call.name)).toEqual(["refresh_all_reminders", "claim_due_reminders", "mark_reminder_sent"]);
    expect(calls[2].args).toEqual({ p_reminder_id: claimed().reminder_id });
    expect(service.createServiceClient).toHaveBeenCalledWith(ENV.SUPABASE_SERVICE_ROLE_KEY);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ENV.RESEND_API_KEY}`);
    expect(headers["Idempotency-Key"]).toBe(`reminder-${claimed().reminder_id}`);
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ from: ENV.REMINDER_FROM_EMAIL, to: ["student@example.test"], subject: "Your statement closes Thu. Quick move?" });
    expect(sent.text).toContain("$150 or less");
    expect(sent.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const unsubscribe = /^<(https:\/\/app\.test\/api\/v1\/reminders\/unsubscribe\?token=(.+))>$/.exec(sent.headers["List-Unsubscribe"]);
    expect(unsubscribe).not.toBeNull();
    expect(sent.html).toContain(unsubscribe![1]);
    expect(verifyUnsubscribeToken(unsubscribe![2], ENV.REMINDER_UNSUBSCRIBE_SECRET)).toBe(STUDENT);

    // nothing about the student in the answer or the logs
    const logs = JSON.stringify([vi.mocked(console.log).mock.calls, vi.mocked(console.error).mock.calls]);
    for (const secret of ["student@example.test", "Savor", ENV.RESEND_API_KEY, ENV.SUPABASE_SERVICE_ROLE_KEY, STUDENT]) {
      expect(logs).not.toContain(secret);
      expect(JSON.stringify(body)).not.toContain(secret);
    }
  });

  it("releases the claim when Resend refuses, and logs only the status and error name", async () => {
    const calls = database({ claim_due_reminders: [{ data: [claimed()], error: null }] });
    resend(Response.json({ statusCode: 422, name: "validation_error", message: "Invalid `to` field: student@example.test" }, { status: 422 }));

    const body = await (await cron()).json();
    expect(body).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    expect(calls.map((call) => call.name)).toEqual(["refresh_all_reminders", "claim_due_reminders", "release_reminder_claim"]);
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).toContain("validation_error");
    expect(logs).not.toContain("student@example.test");
  });

  it("releases the claim when Resend cannot be reached", async () => {
    const calls = database({ claim_due_reminders: [{ data: [claimed()], error: null }] });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await (await cron()).json()).toMatchObject({ failed: 1, sent: 0 });
    expect(calls.at(-1)?.name).toBe("release_reminder_claim");
  });

  it("sends exactly what the claim returns: one per student is the database's call", async () => {
    // claim_due_reminders already kept one per student; the route sends each row once
    const rows = [claimed(), claimed({ reminder_id: "00000000-0000-4000-8000-0000000000a2", student_id: "00000000-0000-4000-8000-0000000000bb", kind: "payment_due", occurrence: "2026-12-09" })];
    const calls = database({ claim_due_reminders: [{ data: rows, error: null }] });
    const fetchMock = resend();
    expect(await (await cron()).json()).toMatchObject({ claimed: 2, sent: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls.find((call) => call.name === "claim_due_reminders")?.args).toEqual({ p_limit: 50 });
    expect(calls.filter((call) => call.name === "mark_reminder_sent").map((call) => call.args)).toEqual(rows.map((row) => ({ p_reminder_id: row.reminder_id })));
  });

  it("sends nothing when nothing is due", async () => {
    database({ claim_due_reminders: [{ data: [], error: null }] });
    const fetchMock = resend();
    expect(await (await cron()).json()).toEqual({ claimed: 0, sent: 0, failed: 0, unconfirmed: 0, deferred: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when the claim fails, and keeps going when only the refresh fails", async () => {
    database({ claim_due_reminders: [{ data: null, error: { code: "PGRST000", message: "down" } }] });
    expect((await cron()).status).toBe(503);
    database({ refresh_all_reminders: [{ data: null, error: { code: "57014", message: "timeout" } }], claim_due_reminders: [{ data: [claimed()], error: null }] });
    resend();
    expect(await (await cron()).json()).toMatchObject({ sent: 1 });
  });

  it("counts a sent email it could not mark as unconfirmed, without releasing it", async () => {
    const failure = { data: null, error: { code: "PGRST000", message: "down" } };
    const calls = database({ claim_due_reminders: [{ data: [claimed()], error: null }], mark_reminder_sent: [failure, failure] });
    resend();
    expect(await (await cron()).json()).toMatchObject({ sent: 0, unconfirmed: 1 });
    expect(calls.map((call) => call.name)).not.toContain("release_reminder_claim");
  });
});
