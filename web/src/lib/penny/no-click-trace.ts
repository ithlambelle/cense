import type { CaptureResult } from "posthog-js";

import { ROUTES } from "@/lib/routes";

// Ask Penny leaves no click trace in PostHog: no autocaptured, rage or dead
// clicks and no heatmap points from /learn/penny. Where a student taps there
// can show that they reached the 988 line (Call 988, Text 988), heatmaps
// record taps even inside ph-no-capture, and students are identified by
// their user id. penny_question_asked still counts how Penny is used.
const CLICK_EVENTS = new Set(["$autocapture", "$rageclick", "$dead_click", "$copy_autocapture"]);

function onPenny(address: unknown): boolean {
  if (typeof address !== "string") return false;
  try {
    return new URL(address, "https://cense.invalid").pathname === ROUTES.penny;
  } catch {
    return false;
  }
}

export function dropPennyClicks(event: CaptureResult): CaptureResult | null {
  const properties = event.properties ?? {};
  if (CLICK_EVENTS.has(event.event) && onPenny(properties.$current_url)) return null;
  const heatmap = properties.$heatmap_data;
  if (event.event === "$$heatmap" && heatmap && typeof heatmap === "object") {
    const kept = Object.fromEntries(Object.entries(heatmap as Record<string, unknown>).filter(([page]) => !onPenny(page)));
    if (Object.keys(kept).length === 0) return null;
    return { ...event, properties: { ...properties, $heatmap_data: kept } };
  }
  return event;
}
