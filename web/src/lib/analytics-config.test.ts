import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import { analyticsEnvironment, baseProperties, EVENT_SEND_INTERVAL_MS, posthogConfig, stripQuery, stripQueryStrings } from "./analytics-config";

const event = (overrides: Partial<CaptureResult>): CaptureResult => ({ uuid: "u", event: "$pageview", properties: {}, ...overrides });

describe("stripQuery", () => {
  it("drops everything after ? or #, in full and relative addresses", () => {
    expect(stripQuery("https://censefinance.com/sign-in?next=%2Fcards%2Fx&code=123")).toBe("https://censefinance.com/sign-in");
    expect(stripQuery("/denied/plan?application=00000000-0000-4000-8000-000000000001")).toBe("/denied/plan");
    expect(stripQuery("https://censefinance.com/home#top")).toBe("https://censefinance.com/home");
    expect(stripQuery("https://censefinance.com/home")).toBe("https://censefinance.com/home");
    expect(stripQuery("$direct")).toBe("$direct");
  });
});

describe("stripQueryStrings (before_send)", () => {
  it("strips every address property, in the event and in $set and $set_once", () => {
    const result = stripQueryStrings(
      event({
        properties: {
          $current_url: "https://censefinance.com/reset-password?code=abc",
          $referrer: "https://mail.example.com/?token=x",
          $session_entry_url: "https://censefinance.com/start?next=x",
          $external_click_url: "https://issuer.example.com/apply?ref=cense",
          $pathname: "/reset-password",
          tier: "likely_fit",
        },
        $set: { $current_url: "https://censefinance.com/a?b=c" },
        $set_once: { $initial_current_url: "https://censefinance.com/sign-in?code=1", $initial_referrer: "$direct" },
      }),
    );
    expect(result?.properties).toEqual({
      $current_url: "https://censefinance.com/reset-password",
      $referrer: "https://mail.example.com/",
      $session_entry_url: "https://censefinance.com/start",
      $external_click_url: "https://issuer.example.com/apply",
      $pathname: "/reset-password",
      tier: "likely_fit",
    });
    expect(result?.$set).toEqual({ $current_url: "https://censefinance.com/a" });
    expect(result?.$set_once).toEqual({ $initial_current_url: "https://censefinance.com/sign-in", $initial_referrer: "$direct" });
  });

  it("strips the page addresses that heatmap clicks are grouped under", () => {
    const result = stripQueryStrings(
      event({
        event: "$$heatmap",
        properties: {
          $heatmap_data: {
            "https://censefinance.com/cards/x?code=1": [{ x: 1, y: 2 }],
            "https://censefinance.com/cards/x?code=2": [{ x: 3, y: 4 }],
          },
        },
      }),
    );
    expect(result?.properties.$heatmap_data).toEqual({ "https://censefinance.com/cards/x": [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
  });

  it("strips link addresses inside autocapture's element data", () => {
    const result = stripQueryStrings(
      event({
        event: "$autocapture",
        properties: {
          $elements_chain: 'a.row:attr__href="/denied/plan?application=1"href="/denied/plan?application=1"nth-child="1"',
          $elements: [{ tag_name: "a", attr__href: "/denied/plan?application=1", $el_text: "Yes" }],
        },
      }),
    );
    expect(result?.properties.$elements_chain).toBe('a.row:attr__href="/denied/plan"href="/denied/plan"nth-child="1"');
    expect(result?.properties.$elements).toEqual([{ tag_name: "a", attr__href: "/denied/plan", $el_text: "Yes" }]);
  });
});

describe("baseProperties", () => {
  it("asks PostHog to skip the location lookup on every event", () => {
    expect(baseProperties()).toMatchObject({ $geoip_disable: true, plan_version: 1, is_internal: false });
  });
});

describe("analyticsEnvironment", () => {
  it("is production or preview only on those Vercel builds", () => {
    expect(analyticsEnvironment("production")).toBe("production");
    expect(analyticsEnvironment("preview")).toBe("preview");
    expect(analyticsEnvironment("development")).toBe("development");
    expect(analyticsEnvironment(undefined)).toBe("development");
  });
});

describe("posthogConfig", () => {
  const config = posthogConfig();

  it("sets every remotely switchable feature explicitly, so the PostHog UI cannot change them", () => {
    for (const key of ["autocapture", "rageclick", "capture_dead_clicks", "capture_heatmaps", "capture_performance", "capture_exceptions", "disable_surveys"] as const) {
      expect(config[key], key).not.toBeUndefined();
    }
  });

  // Global Privacy Control (and Do Not Track) opts the browser out (privacy policy).
  it("honors the browser's request not to be tracked", () => {
    expect(config.respect_dnt).toBe(true);
  });

  it("sends queued events on the interval Delete my account waits for", () => {
    expect(config.request_queue_config).toEqual({ flush_interval_ms: EVENT_SEND_INTERVAL_MS });
  });

  it("uses the proxy, no cookie, the query filter, and no feature flag requests", () => {
    expect(config.advanced_disable_feature_flags).toBe(true);
    expect(config.api_host).toBe("/rx");
    expect(config.persistence).toBe("localStorage");
    expect(config.before_send).toBe(stripQueryStrings);
  });

  it("records replay with typing masked and never request bodies or headers", () => {
    expect(config.session_recording).toMatchObject({ maskAllInputs: true, maskTextSelector: ".ph-sensitive", recordHeaders: false, recordBody: false });
    const mask = config.session_recording?.maskCapturedNetworkRequestFn;
    expect(mask?.({ name: "https://censefinance.com/api/v1/quiz?x=1" } as never)).toMatchObject({ name: "https://censefinance.com/api/v1/quiz" });
  });
});
