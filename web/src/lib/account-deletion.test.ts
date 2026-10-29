import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { accountDeletionConfig, DELETE_ANALYTICS_HISTORY, deletePostHogPerson } from "./account-deletion";

const STUDENT = "00000000-0000-4000-8000-000000000001";
const ADMIN = { apiKey: "not-a-real-key", projectId: "12345" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("accountDeletionConfig", () => {
  it("needs only the service role key where analytics is off", () => {
    expect(accountDeletionConfig({ SUPABASE_SERVICE_ROLE_KEY: "service" })).toEqual({ ok: true, serviceRoleKey: "service", posthog: null });
  });

  it("needs PostHog's personal key and project where analytics runs", () => {
    expect(accountDeletionConfig({ SUPABASE_SERVICE_ROLE_KEY: "service", NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc" })).toEqual({
      ok: false,
      missing: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"],
    });
    expect(
      accountDeletionConfig({
        SUPABASE_SERVICE_ROLE_KEY: "service",
        NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc",
        POSTHOG_PERSONAL_API_KEY: ADMIN.apiKey,
        POSTHOG_PROJECT_ID: ADMIN.projectId,
      }),
    ).toEqual({ ok: true, serviceRoleKey: "service", posthog: ADMIN });
  });

  it("names every missing setting", () => {
    expect(accountDeletionConfig({})).toEqual({ ok: false, missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
  });
});

describe("deletePostHogPerson", () => {
  // S28: the person goes with its events and recordings.
  it("deletes the person by the student's id, with events and recordings", async () => {
    expect(DELETE_ANALYTICS_HISTORY).toBe(true);
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ persons_found: 1, persons_queued_for_deletion: 1, deletion_errors: [] }, { status: 202 }));
    expect(await deletePostHogPerson(STUDENT, ADMIN, fetchFn)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://us.posthog.com/api/projects/12345/persons/bulk_delete/");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Authorization: "Bearer not-a-real-key", "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({ distinct_ids: [STUDENT], delete_events: true, delete_recordings: true });
  });

  it("counts a student PostHog never saw as done", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ persons_found: 0, deletion_errors: [] }, { status: 202 }));
    expect(await deletePostHogPerson(STUDENT, ADMIN, fetchFn)).toBe(true);
  });

  it("fails on a refusal, a deletion error or no answer", async () => {
    expect(await deletePostHogPerson(STUDENT, ADMIN, vi.fn<typeof fetch>(async () => new Response("no", { status: 403 })))).toBe(false);
    expect(
      await deletePostHogPerson(STUDENT, ADMIN, vi.fn<typeof fetch>(async () => Response.json({ deletion_errors: [{ step: "events" }] }, { status: 202 }))),
    ).toBe(false);
    expect(await deletePostHogPerson(STUDENT, ADMIN, vi.fn<typeof fetch>(async () => Promise.reject(new Error("offline"))))).toBe(false);
  });
});
