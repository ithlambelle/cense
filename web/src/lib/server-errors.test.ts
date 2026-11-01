import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reportServerError } from "./server-errors";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function fakeClient() {
  return { captureExceptionImmediate: vi.fn(async () => undefined) };
}

describe("reportServerError", () => {
  it("sends the error with where it happened, no student and no location", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    const client = fakeClient();
    const error = new Error("boom");
    await reportServerError(error, { route: "/api/v1/applications/[id]", route_type: "route" }, client);
    expect(client.captureExceptionImmediate).toHaveBeenCalledWith(error, undefined, {
      route: "/api/v1/applications/[id]",
      route_type: "route",
      environment: "production",
      app_version: "local",
      $geoip_disable: true,
    });
  });

  it("does nothing when the PostHog project token is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    vi.resetModules();
    const fresh = await import("./server-errors");
    await expect(fresh.reportServerError(new Error("boom"), { route: "/home" })).resolves.toBeUndefined();
    expect(fresh.serverErrorTrackingOn()).toBe(false);
  });

  it("is on when the token is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "not-a-real-token");
    vi.resetModules();
    const fresh = await import("./server-errors");
    expect(fresh.serverErrorTrackingOn()).toBe(true);
  });

  it("never throws when PostHog fails, and says so in the log", async () => {
    const client = { captureExceptionImmediate: vi.fn(async () => Promise.reject(new Error("posthog down"))) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(reportServerError(new Error("boom"), { route: "/home" }, client)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: "error_report_failed" }));
  });
});
