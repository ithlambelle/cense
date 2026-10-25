import posthog from "posthog-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EVENT_SEND_INTERVAL_MS } from "./analytics-config";
import { applyAnalyticsChoice, browserAsksNotToTrack, forgetDeletedStudent, identify, pauseAnalytics, resetAnalytics, track } from "./analytics";

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

// PostHog's consent, as a browser that never chose: capturing, nothing explicit.
function consent(status: "granted" | "denied" | "pending", optedOut = status === "denied") {
  vi.spyOn(posthog, "get_explicit_consent_status").mockReturnValue(status);
  vi.spyOn(posthog, "has_opted_out_capturing").mockReturnValue(optedOut);
}

describe("identify", () => {
  beforeEach(() => consent("pending"));

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

describe("identify with the student's Analytics switch", () => {
  beforeEach(() => {
    posthog.__loaded = true;
    vi.spyOn(posthog, "get_distinct_id").mockReturnValue("anonymous-device-id");
    vi.spyOn(posthog, "_isIdentified").mockReturnValue(false);
    vi.spyOn(posthog, "register").mockImplementation(() => undefined);
  });

  it("off: opts this browser out, which stops events and recordings, and never links it", () => {
    consent("pending", false);
    const optOut = vi.spyOn(posthog, "opt_out_capturing").mockImplementation(() => undefined);
    const identifySpy = vi.spyOn(posthog, "identify").mockImplementation(() => undefined);
    identify(STUDENT, false, false);
    expect(optOut).toHaveBeenCalledOnce();
    expect(identifySpy).not.toHaveBeenCalled();
  });

  it("on again, from another device: opts back in without an event, then identifies", () => {
    consent("denied");
    const order: string[] = [];
    vi.spyOn(posthog, "opt_in_capturing").mockImplementation((options) => void order.push(`opt in ${JSON.stringify(options)}`));
    vi.spyOn(posthog, "has_opted_out_capturing").mockImplementation(() => !order.some((step) => step.startsWith("opt in")));
    vi.spyOn(posthog, "identify").mockImplementation(() => void order.push("identify"));
    identify(STUDENT, false, true);
    expect(order).toEqual(['opt in {"captureEventName":false}', "identify"]);
  });

  it("on, but the browser sends Global Privacy Control: stays out and unlinked", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    consent("denied");
    const optIn = vi.spyOn(posthog, "opt_in_capturing").mockImplementation(() => undefined);
    const identifySpy = vi.spyOn(posthog, "identify").mockImplementation(() => undefined);
    identify(STUDENT, false, true);
    expect(optIn).not.toHaveBeenCalled();
    expect(identifySpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("unknown (the profile could not be read): changes nothing, and a browser that is out stays unlinked", () => {
    consent("denied");
    const optIn = vi.spyOn(posthog, "opt_in_capturing").mockImplementation(() => undefined);
    const optOut = vi.spyOn(posthog, "opt_out_capturing").mockImplementation(() => undefined);
    const identifySpy = vi.spyOn(posthog, "identify").mockImplementation(() => undefined);
    identify(STUDENT, false, null);
    expect(optIn).not.toHaveBeenCalled();
    expect(optOut).not.toHaveBeenCalled();
    expect(identifySpy).not.toHaveBeenCalled();
  });
});

describe("browserAsksNotToTrack", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads Global Privacy Control and Do Not Track, as PostHog does", () => {
    vi.stubGlobal("navigator", {});
    expect(browserAsksNotToTrack()).toBe(false);
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    expect(browserAsksNotToTrack()).toBe(true);
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    expect(browserAsksNotToTrack()).toBe(true);
    vi.stubGlobal("navigator", { doNotTrack: "0", globalPrivacyControl: false });
    expect(browserAsksNotToTrack()).toBe(false);
  });
});

describe("applyAnalyticsChoice", () => {
  it("off opts out; on identifies again", () => {
    posthog.__loaded = true;
    consent("pending");
    const optOut = vi.spyOn(posthog, "opt_out_capturing").mockImplementation(() => undefined);
    applyAnalyticsChoice(false, STUDENT, false);
    expect(optOut).toHaveBeenCalledOnce();
    vi.spyOn(posthog, "get_distinct_id").mockReturnValue("anonymous-device-id");
    vi.spyOn(posthog, "_isIdentified").mockReturnValue(false);
    vi.spyOn(posthog, "register").mockImplementation(() => undefined);
    const identifySpy = vi.spyOn(posthog, "identify").mockImplementation(() => undefined);
    applyAnalyticsChoice(true, STUDENT, false);
    expect(identifySpy).toHaveBeenCalledExactlyOnceWith(STUDENT);
  });

  it("does nothing while PostHog is not loaded", () => {
    const optOut = vi.spyOn(posthog, "opt_out_capturing");
    applyAnalyticsChoice(false, STUDENT, false);
    expect(optOut).not.toHaveBeenCalled();
  });
});

describe("pauseAnalytics and forgetDeletedStudent", () => {
  it("stops capture, waits one send interval for the queue, and puts back what the browser had if it fails", async () => {
    vi.useFakeTimers();
    posthog.__loaded = true;
    const optOut = vi.spyOn(posthog, "opt_out_capturing").mockImplementation(() => undefined);
    const optIn = vi.spyOn(posthog, "opt_in_capturing").mockImplementation(() => undefined);
    const clear = vi.spyOn(posthog, "clear_opt_in_out_capturing").mockImplementation(() => undefined);
    consent("granted", false);
    let paused = false;
    const pausing = pauseAnalytics().then((resume) => {
      paused = true;
      return resume;
    });
    await vi.advanceTimersByTimeAsync(EVENT_SEND_INTERVAL_MS);
    expect(optOut).toHaveBeenCalledOnce();
    expect(paused).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    (await pausing)();
    expect(optIn).toHaveBeenCalledExactlyOnceWith({ captureEventName: false });
    consent("pending", false);
    const pending = pauseAnalytics();
    await vi.advanceTimersByTimeAsync(EVENT_SEND_INTERVAL_MS + 500);
    (await pending)();
    expect(clear).toHaveBeenCalledOnce();
    // Already out (the switch, or the browser's signal): nothing to wait for or undo.
    consent("denied");
    (await pauseAnalytics())();
    expect(optIn).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("after the deletion, drops the student's id and keeps this browser out", () => {
    posthog.__loaded = true;
    const order: string[] = [];
    vi.spyOn(posthog, "reset").mockImplementation(() => void order.push("reset"));
    vi.spyOn(posthog, "opt_out_capturing").mockImplementation(() => void order.push("opt out"));
    forgetDeletedStudent();
    expect(order).toEqual(["reset", "opt out"]);
  });

  it("does nothing while PostHog is not loaded", async () => {
    const optOut = vi.spyOn(posthog, "opt_out_capturing");
    const reset = vi.spyOn(posthog, "reset");
    (await pauseAnalytics())();
    forgetDeletedStudent();
    expect(optOut).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
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
