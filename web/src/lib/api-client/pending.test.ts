import { afterEach, describe, expect, it, vi } from "vitest";

import { FALLBACK_MESSAGE, OFFLINE_MESSAGE, REQUEST_TIMEOUT_MS } from "./client";
import { pendingRequest } from "./pending";

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json(body, { status })));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pendingRequest", () => {
  it("says unavailable while the backend route does not exist (Next's HTML 404 or a 501)", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("<html>404</html>", { status: 404 })));
    expect(await pendingRequest("GET /reminders")).toEqual({ kind: "unavailable" });
    answer(501, {});
    expect(await pendingRequest("GET /reminders")).toEqual({ kind: "unavailable" });
  });

  it("treats a JSON 404 from a real route as an answer, not a missing route", async () => {
    answer(404, { error: { code: "not_found", message: "No plan yet." } });
    expect(await pendingRequest("GET /plan")).toEqual({ kind: "failed", message: "No plan yet.", code: "not_found" });
  });

  it("says signed-out on 401 and failed on a server error", async () => {
    answer(401, {});
    expect(await pendingRequest("GET /plan")).toEqual({ kind: "signed-out" });
    answer(500, {});
    expect(await pendingRequest("GET /plan")).toEqual({ kind: "failed", message: FALLBACK_MESSAGE, code: undefined });
  });

  it("gives up after the same timeout as every other request, so a stalled sign-in cannot spin for ever", async () => {
    vi.useFakeTimers();
    // A request that never answers until it is cut off.
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        (_, init) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
    );
    const result = pendingRequest("POST /auth/password/signin", { email: "a@b.edu", password: "x" });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await result).toEqual({ kind: "failed", message: OFFLINE_MESSAGE });
  });

  it("says the connection failed when no answer comes back", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await pendingRequest("GET /plan")).toEqual({ kind: "failed", message: OFFLINE_MESSAGE });
  });

  it("accepts a real answer only when it matches the spec", async () => {
    const reminder = { id: "00000000-0000-4000-8000-0000000000aa", applicationId: "00000000-0000-4000-8000-000000000001", remindOn: "2027-04-16", createdAt: "2026-10-16T00:00:00Z" };
    answer(201, reminder);
    expect(await pendingRequest("POST /reminders", { applicationId: reminder.applicationId, remindOn: "2027-04-16" })).toEqual({ kind: "ok", data: reminder });
    answer(201, { ...reminder, remindOn: "next april" });
    expect((await pendingRequest("POST /reminders", { applicationId: reminder.applicationId, remindOn: "2027-04-16" })).kind).toBe("failed");
  });

  it("uses fixtures only when mocks are switched on outside production", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("<html>404</html>", { status: 404 }));
    vi.stubGlobal("fetch", fetchFn);
    vi.stubEnv("NEXT_PUBLIC_CENSE_MOCKS", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect((await pendingRequest("GET /plan")).kind).toBe("ok");
    expect(fetchFn).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    expect(await pendingRequest("GET /plan")).toEqual({ kind: "unavailable" });
    expect(fetchFn).toHaveBeenCalledOnce();
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
