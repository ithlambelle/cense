import posthog from "posthog-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { identify, resetAnalytics, track } from "./analytics";

afterEach(() => {
  vi.restoreAllMocks();
  posthog.__loaded = false;
});

describe("track", () => {
  it("sends nothing while PostHog is not loaded (no token set)", () => {
    const capture = vi.spyOn(posthog, "capture");
    const identifySpy = vi.spyOn(posthog, "identify");
    const reset = vi.spyOn(posthog, "reset");
    expect(posthog.__loaded).toBeFalsy();
    track("quiz_completed", { retake: false });
    identify("00000000-0000-4000-8000-000000000001");
    resetAnalytics();
    expect(capture).not.toHaveBeenCalled();
    expect(identifySpy).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("captures the event with only the given properties once PostHog is loaded", () => {
    posthog.__loaded = true;
    const capture = vi.spyOn(posthog, "capture").mockImplementation(() => undefined);
    track("issuer_clicked", { kind: "apply", card_id: "discover-it-student-cash-back" });
    track("denial_plan_viewed");
    expect(capture).toHaveBeenNthCalledWith(1, "issuer_clicked", { kind: "apply", card_id: "discover-it-student-cash-back" });
    expect(capture).toHaveBeenNthCalledWith(2, "denial_plan_viewed", undefined);
  });

  it("never throws, even when PostHog does", () => {
    posthog.__loaded = true;
    vi.spyOn(posthog, "capture").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => track("card_added_manually")).not.toThrow();
  });
});
