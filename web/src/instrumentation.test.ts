import { afterEach, describe, expect, it, vi } from "vitest";

const { reportServerError } = vi.hoisted(() => ({ reportServerError: vi.fn(async () => undefined) }));
vi.mock("@/lib/server-errors", () => ({ reportServerError }));

import { onRequestError } from "./instrumentation";

const REQUEST = { path: "/api/v1/applications/0f1e?token=secret", method: "PATCH", headers: { cookie: "sb-auth-token=x" } };
const CONTEXT = {
  routerKind: "App Router",
  routePath: "/api/v1/applications/[id]",
  routeType: "route",
  renderSource: undefined,
  revalidateReason: undefined,
  renderType: "dynamic",
} as unknown as Parameters<typeof onRequestError>[2];

afterEach(() => {
  vi.unstubAllEnvs();
  reportServerError.mockClear();
});

describe("onRequestError", () => {
  it("reports the route's file path and method, never its address or headers", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const error = new Error("boom");
    await onRequestError(error, REQUEST, CONTEXT);
    expect(reportServerError).toHaveBeenCalledWith(error, { route: "/api/v1/applications/[id]", route_type: "route", method: "PATCH" });
    expect(JSON.stringify(reportServerError.mock.calls)).not.toMatch(/0f1e|token|cookie/);
  });

  it("skips the Edge runtime, where posthog-node does not run", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("boom"), REQUEST, CONTEXT);
    expect(reportServerError).not.toHaveBeenCalled();
  });
});
