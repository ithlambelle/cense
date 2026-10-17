import { afterEach, describe, expect, it, vi } from "vitest";

import { pendingRequest } from "./pending";

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json(body, { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pendingRequest", () => {
  it("says unavailable while the backend route does not exist", async () => {
    answer(404, { error: { code: "not_found", message: "Not found" } });
    expect(await pendingRequest("GET /reminders")).toEqual({ kind: "unavailable" });
  });

  it("says signed-out on 401 and failed on a server error", async () => {
    answer(401, {});
    expect(await pendingRequest("GET /plan")).toEqual({ kind: "signed-out" });
    answer(500, {});
    expect((await pendingRequest("GET /plan")).kind).toBe("failed");
  });

  it("accepts a real answer only when it matches the spec", async () => {
    const reminder = { id: "00000000-0000-4000-8000-0000000000aa", applicationId: "00000000-0000-4000-8000-000000000001", remindOn: "2027-04-16", createdAt: "2026-10-16T00:00:00Z" };
    answer(201, reminder);
    expect(await pendingRequest("POST /reminders", { applicationId: reminder.applicationId, remindOn: "2027-04-16" })).toEqual({ kind: "ok", data: reminder });
    answer(201, { ...reminder, remindOn: "next april" });
    expect((await pendingRequest("POST /reminders", { applicationId: reminder.applicationId, remindOn: "2027-04-16" })).kind).toBe("failed");
  });

  it("uses fixtures only when mocks are switched on outside production", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFn);
    vi.stubEnv("NEXT_PUBLIC_CENSE_MOCKS", "1");
    vi.stubEnv("NODE_ENV", "production");
    await pendingRequest("GET /plan").catch(() => undefined);
    expect(fetchFn).toHaveBeenCalled();
  });

  it("treats a 401 with invalid_credentials as wrong details, not a signed-out student", async () => {
    answer(401, { error: { code: "invalid_credentials", message: "The email or password is incorrect." } });
    expect(await pendingRequest("POST /auth/password/signin", { email: "a@b.edu", password: "x" })).toEqual({
      kind: "failed",
      message: "The email or password is incorrect.",
      code: "invalid_credentials",
    });
  });
});
