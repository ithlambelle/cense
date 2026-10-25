import posthog from "posthog-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureError, identify, resetAnalytics, track } from "./analytics";

const STUDENT = "00000000-0000-4000-8000-000000000001";
const CLICK = "00000000-0000-4000-8000-0000000000c1";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  posthog.__loaded = false;
});

describe("track", () => {
  it("sends nothing while PostHog is not loaded (no token set)", () => {
    const capture = vi.spyOn(posthog, "capture");
    const identifySpy = vi.spyOn(posthog, "identify");
    const reset = vi.spyOn(posthog, "reset");
    track("quiz_completed", { retake: false });
    identify(STUDENT, false);
    resetAnalytics();
    expect(capture).not.toHaveBeenCalled();
    expect(identifySpy).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("captures the checked properties, and the row id and time for a ledger copy", () => {
    posthog.__loaded = true;
    const capture = vi.spyOn(posthog, "capture").mockImplementation(() => undefined);
    const at = new Date("2026-10-18T12:00:00Z");
    track("issuer_link_clicked", { click_id: CLICK, card_id: "discover-it-student-cash-back", link_type: "apply" }, { uuid: CLICK, timestamp: at });
    track("denial_plan_viewed");
    expect(capture).toHaveBeenNthCalledWith(
      1,
      "issuer_link_clicked",
      { click_id: CLICK, card_id: "discover-it-student-cash-back", link_type: "apply" },
      { uuid: CLICK, timestamp: at },
    );
    expect(capture).toHaveBeenNthCalledWith(2, "denial_plan_viewed", {}, undefined);
  });

  it("throws in tests and development on a property the catalog does not list", () => {
    const sneaky = { retake: false, email: "a@example.com" } as unknown as { retake: boolean };
    expect(() => track("quiz_completed", sneaky)).toThrow(/does not match the catalog/);
    const badValue = { outcome: "maybe", source: "mark_result" } as unknown as { outcome: "approved"; source: "mark_result" };
    expect(() => track("outcome_reported", badValue)).toThrow(/does not match the catalog/);
  });

  it("in a deployed build drops a bad event and reports it, without its properties", () => {
    vi.stubEnv("NODE_ENV", "production");
    posthog.__loaded = true;
    const capture = vi.spyOn(posthog, "capture").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sneaky = { retake: false, email: "a@example.com" } as unknown as { retake: boolean };
    expect(() => track("quiz_completed", sneaky)).not.toThrow();
    expect(capture).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "analytics_event_invalid", analyticsEvent: "quiz_completed" }));
    expect(String(warn.mock.calls[0][0])).not.toContain("example.com");
  });

  it("never throws when PostHog does, and reports it", () => {
    posthog.__loaded = true;
    vi.spyOn(posthog, "capture").mockImplementation(() => {
      throw new Error("blocked");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => track("card_added", { method: "manual" })).not.toThrow();
    expect(warn).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "analytics_capture_failed", analyticsEvent: "card_added" }));
  });

  it("prints events on a preview deployment", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    track("quiz_completed", { retake: true });
    expect(info).toHaveBeenCalledExactlyOnceWith("[analytics]", "quiz_completed", { retake: true });
  });
});

describe("identify", () => {
  it("identifies a new student and marks whether the account is the team's", () => {
    posthog.__loaded = true;
    vi.spyOn(posthog, "get_distinct_id").mockReturnValue("anonymous-device-id");
    vi.spyOn(posthog, "_isIdentified").mockReturnValue(false);
    const identifySpy = vi.spyOn(posthog, "identify").mockImplementation(() => undefined);
    const register = vi.spyOn(posthog, "register").mockImplementation(() => undefined);
    const reset = vi.spyOn(posthog, "reset");
    identify(STUDENT, true);
    expect(reset).not.toHaveBeenCalled();
    expect(identifySpy).toHaveBeenCalledExactlyOnceWith(STUDENT);
    expect(register).toHaveBeenCalledWith({ is_internal: true });
  });

  it("does not identify again on each page load", () => {
    posthog.__loaded = true;
    vi.spyOn(posthog, "get_distinct_id").mockReturnValue(STUDENT);
    const identifySpy = vi.spyOn(posthog, "identify").mockImplementation(() => undefined);
    vi.spyOn(posthog, "register").mockImplementation(() => undefined);
    identify(STUDENT, false);
    expect(identifySpy).not.toHaveBeenCalled();
  });

  it("resets first when another student was identified on this browser", () => {
    posthog.__loaded = true;
    vi.spyOn(posthog, "get_distinct_id").mockReturnValue("00000000-0000-4000-8000-000000000002");
    vi.spyOn(posthog, "_isIdentified").mockReturnValue(true);
    const order: string[] = [];
    vi.spyOn(posthog, "reset").mockImplementation(() => void order.push("reset"));
    vi.spyOn(posthog, "identify").mockImplementation(() => void order.push("identify"));
    vi.spyOn(posthog, "register").mockImplementation(() => undefined);
    identify(STUDENT, false);
    expect(order).toEqual(["reset", "identify"]);
  });
});

describe("resetAnalytics", () => {
  it("resets, then sets the every-event properties again", () => {
    posthog.__loaded = true;
    const reset = vi.spyOn(posthog, "reset").mockImplementation(() => undefined);
    const register = vi.spyOn(posthog, "register").mockImplementation(() => undefined);
    resetAnalytics();
    expect(reset).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ plan_version: 1, is_internal: false }));
  });
});

describe("captureError", () => {
  it("sends nothing while PostHog is not loaded (no token set)", () => {
    const captureException = vi.spyOn(posthog, "captureException");
    captureError("page", new Error("boom"));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("sends the error to error tracking with where it happened", () => {
    posthog.__loaded = true;
    const captureException = vi.spyOn(posthog, "captureException").mockImplementation(() => undefined);
    const error = new Error("boom");
    captureError("page", error);
    expect(captureException).toHaveBeenCalledWith(error, { where: "page" });
  });

  it("never throws when PostHog does", () => {
    posthog.__loaded = true;
    vi.spyOn(posthog, "captureException").mockImplementation(() => {
      throw new Error("posthog down");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => captureError("page", new Error("boom"))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: "analytics_exception_failed", analyticsEvent: null }));
  });
});
