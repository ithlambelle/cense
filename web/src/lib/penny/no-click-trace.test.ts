import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import { posthogConfig } from "@/lib/analytics-config";

// Through the app's own before_send, as PostHog runs it on every event.
function send(event: string, properties: Record<string, unknown>): CaptureResult | null {
  const steps = [posthogConfig().before_send].flat();
  return steps.reduce<CaptureResult | null>((current, step) => (current && step ? step(current) : current), {
    uuid: "e",
    event,
    properties,
  } as CaptureResult);
}

const PENNY = "https://censefinance.com/learn/penny?answer=credit-score";
const HOME = "https://censefinance.com/home";

// Where a student taps in Ask Penny can show that they reached the 988 line
// (Call 988, Text 988), and students are identified by their user id.
describe("Ask Penny leaves no click trace in PostHog", () => {
  it.each(["$autocapture", "$rageclick", "$dead_click"])("drops %s on Ask Penny", (event) => {
    expect(send(event, { $current_url: PENNY })).toBeNull();
  });

  it("keeps clicks on other screens", () => {
    expect(send("$autocapture", { $current_url: HOME })?.properties.$current_url).toBe(HOME);
  });

  it("drops Ask Penny's heatmap points and keeps other screens'", () => {
    const point = { x: 10, y: 20, target_fixed: false, type: "click" };
    const kept = send("$$heatmap", { $current_url: HOME, $heatmap_data: { [PENNY]: [point], [HOME]: [point] } });
    expect(kept?.properties.$heatmap_data).toEqual({ [HOME]: [point] });
    expect(send("$$heatmap", { $current_url: PENNY, $heatmap_data: { [PENNY]: [point] } })).toBeNull();
  });

  it("keeps Ask Penny's page views and its own usage event", () => {
    expect(send("$pageview", { $current_url: PENNY })).not.toBeNull();
    expect(send("penny_question_asked", { $current_url: PENNY, source: "typed", outcome: "answered" })).not.toBeNull();
  });
});
