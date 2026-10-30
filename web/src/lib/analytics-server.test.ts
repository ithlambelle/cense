import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TRACKING_PLAN_VERSION } from "./analytics-catalog";
import { captureServer, POSTHOG_BATCH_URL, withAnalyticsOn } from "./analytics-server";

const STUDENT = "00000000-0000-4000-8000-0000000000aa";

function fakeFetch(status = 200) {
  return vi.fn<typeof fetch>(async () => new Response("{}", { status }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("captureServer", () => {
  it("sends nothing without a project token", async () => {
    const fetch = fakeFetch();
    await captureServer([{ event: "reminder_sent", studentId: STUDENT, properties: { kind: "payment_due" } }], { token: "", fetch });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the batch with the student id, the row id and the common properties, and nothing else", async () => {
    vi.stubEnv("INTERNAL_STUDENT_IDS", STUDENT);
    const fetch = fakeFetch();
    const timestamp = new Date("2026-10-26T13:05:00Z");
    await captureServer(
      [{ event: "reminder_sent", studentId: STUDENT, properties: { kind: "statement_closing" }, uuid: "11111111-1111-4111-8111-111111111111", timestamp }],
      { token: "phc_test", fetch },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(POSTHOG_BATCH_URL);
    expect(JSON.parse(String(init?.body))).toEqual({
      api_key: "phc_test",
      batch: [
        {
          event: "reminder_sent",
          uuid: "11111111-1111-4111-8111-111111111111",
          timestamp: "2026-10-26T13:05:00.000Z",
          properties: {
            kind: "statement_closing",
            distinct_id: STUDENT,
            plan_version: TRACKING_PLAN_VERSION,
            platform: "server",
            app_version: "local",
            environment: "development",
            is_internal: true,
            $geoip_disable: true,
            $lib: "cense-server",
          },
        },
      ],
    });
  });

  it("refuses an event only the browser sends, and one with properties the catalog does not allow", async () => {
    const fetch = fakeFetch();
    await expect(
      captureServer([{ event: "reminder_setup_saved", studentId: STUDENT, properties: { payment_due: true, statement_closing: true } }], { token: "phc_test", fetch }),
    ).rejects.toThrow(/cannot be sent by the server/);
    await expect(
      captureServer(
        [{ event: "reminder_sent", studentId: STUDENT, properties: { kind: "payment_due", email: "a@b.c" } as never }],
        { token: "phc_test", fetch },
      ),
    ).rejects.toThrow(/cannot be sent by the server/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never throws when PostHog fails, and logs only the status", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await captureServer([{ event: "reminder_sent", studentId: STUDENT, properties: { kind: "reapply" } }], { token: "phc_test", fetch: fakeFetch(503) });
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await captureServer([{ event: "reminder_sent", studentId: STUDENT, properties: { kind: "reapply" } }], { token: "phc_test", fetch: offline });
    expect(warn.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      { event: "analytics_server_failed", status: 503, count: 1 },
      { event: "analytics_server_failed", status: null, code: "TypeError", count: 1 },
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(STUDENT);
  });
});

describe("withAnalyticsOn", () => {
  const event = { event: "reminder_sent" as const, studentId: STUDENT, properties: { kind: "reapply" as const } };

  it("reads nothing for no events, and drops everything when the read throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const from = vi.fn(() => { throw new TypeError("offline"); });
    expect(await withAnalyticsOn({ from } as never, [])).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(await withAnalyticsOn({ from } as never, [event])).toEqual([]);
    expect(warn.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      { event: "analytics_consent_read_failed", code: "TypeError", count: 1 },
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(STUDENT);
  });
});
