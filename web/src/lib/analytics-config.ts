import type { BeforeSendFn, CaptureResult, PostHogConfig, Properties } from "posthog-js";

import { TRACKING_PLAN_VERSION } from "@/lib/analytics-catalog";

// PostHog settings and the privacy filter every event passes through. Kept
// apart from instrumentation-client.ts so it can be tested.

export const SENSITIVE = "ph-sensitive";
export const SENSITIVE_SELECTOR = `.${SENSITIVE}`;
// Stronger: the element is left out of session replay altogether (the
// recorder's block class, drawn as an empty box) and out of autocapture,
// rage and dead clicks, href included. For what must leave no trace.
export const NO_CAPTURE = "ph-no-capture";

export type AnalyticsEnvironment = "production" | "preview" | "development";

// Vercel sets NEXT_PUBLIC_VERCEL_ENV on its builds; anything else is a laptop.
export function analyticsEnvironment(vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV): AnalyticsEnvironment {
  return vercelEnv === "production" || vercelEnv === "preview" ? vercelEnv : "development";
}

// Sent with every event (S47). is_internal is set again at identify.
// $geoip_disable tells PostHog's GeoIP step to skip the event, so no city or
// country is stored (D5, S48); the SDKs for servers send the same property.
export function baseProperties(): Properties {
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true));
  return {
    plan_version: TRACKING_PLAN_VERSION,
    platform: standalone ? "home_screen" : "web",
    app_version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    environment: analyticsEnvironment(),
    is_internal: false,
    $geoip_disable: true,
  };
}

// Everything after "?" or "#" in an address: sign-in links, ids and anything a
// future screen puts there never reach PostHog (S48, data rule 6).
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

// Property names that hold an address: $current_url, $referrer,
// $initial_current_url, $session_entry_url, $external_click_url and the like.
const ADDRESS_KEY = /(url|referrer|href)$/i;
// An href inside autocapture's $elements_chain string.
const CHAIN_HREF = /((?:attr__)?href)="([^"]*)"/g;

function stripAddresses(properties: Properties | undefined): Properties | undefined {
  if (!properties) return properties;
  const clean: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && ADDRESS_KEY.test(key)) {
      clean[key] = stripQuery(value);
    } else if (key === "$elements_chain" && typeof value === "string") {
      clean[key] = value.replace(CHAIN_HREF, (_, name: string, href: string) => `${name}="${stripQuery(href)}"`);
    } else if (key === "$heatmap_data" && value && typeof value === "object") {
      // Heatmap clicks are grouped under the page's full address.
      const byPage: Record<string, unknown[]> = {};
      for (const [page, points] of Object.entries(value as Record<string, unknown[]>)) {
        const clean = stripQuery(page);
        byPage[clean] = [...(byPage[clean] ?? []), ...(Array.isArray(points) ? points : [])];
      }
      clean[key] = byPage;
    } else if (key === "$elements" && Array.isArray(value)) {
      clean[key] = value.map((element: unknown) =>
        element && typeof element === "object" ? stripAddresses(element as Properties) : element,
      );
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

// Runs on every event just before it is sent, including $set and $set_once
// (where PostHog keeps the first page a person saw).
export const stripQueryStrings: BeforeSendFn = (event: CaptureResult) => ({
  ...event,
  properties: stripAddresses(event.properties) ?? {},
  $set: stripAddresses(event.$set),
  $set_once: stripAddresses(event.$set_once),
});

export function posthogConfig(): Partial<PostHogConfig> {
  return {
    // Same-origin reverse proxy (rewrites in next.config.ts), so ad blockers
    // do not drop the funnel and no third-party host is called directly.
    api_host: "/rx",
    ui_host: "https://us.posthog.com",
    // The newest settings snapshot this SDK version knows; the replay options
    // below override the ones that matter.
    defaults: "2026-08-30",
    // Anonymous visitors get no person profile; signed-in students are
    // identified by their Supabase user id only (components/analytics).
    person_profiles: "identified_only",
    // Browser storage, no PostHog cookie: one origin, nothing to share.
    persistence: "localStorage",
    before_send: stripQueryStrings,
    // Every feature is set here, so a toggle in the PostHog UI cannot turn one
    // on without a code review. Clicks, rage clicks and dead clicks show where
    // testers get stuck (D24, no broken buttons); `ph-sensitive` keeps the
    // text of marked elements out of them.
    autocapture: true,
    rageclick: true,
    capture_dead_clicks: true,
    capture_heatmaps: true,
    // Request timing in replay, to see a failed save. No web vitals.
    capture_performance: { network_timing: true, web_vitals: false },
    // Error tracking is its own piece of work (S51).
    capture_exceptions: false,
    disable_surveys: true,
    // No feature flags. The /flags request would also carry the first page's
    // full address as a person property, which before_send never sees.
    // Settings (replay on or off) still load, from /array/<token>/config.
    advanced_disable_feature_flags: true,
    session_recording: {
      // Every typed value (email, password, codes, card name, credit limit).
      maskAllInputs: true,
      // Displayed text that restates a student's answers or card status.
      maskTextSelector: SENSITIVE_SELECTOR,
      // Never request or response bodies or headers: the API returns quiz
      // answers, statuses and limits.
      recordHeaders: false,
      recordBody: false,
      // Addresses without their query strings: request addresses, and the page
      // addresses replay records, which the SDK passes through this same function.
      maskCapturedNetworkRequestFn: (request) => ({ ...request, name: stripQuery(request.name) }),
    },
  };
}
