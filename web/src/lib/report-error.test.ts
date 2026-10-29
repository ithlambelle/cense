import { afterEach, describe, expect, it, vi } from "vitest";

const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ captureError }));

import { reportError } from "./report-error";

afterEach(() => {
  vi.restoreAllMocks();
  captureError.mockClear();
});

describe("reportError", () => {
  it("writes to the console and sends the error to error tracking", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("boom");
    reportError("page", error);
    expect(consoleError).toHaveBeenCalledWith("[cense] page", error);
    expect(captureError).toHaveBeenCalledWith("page", error);
  });
});
