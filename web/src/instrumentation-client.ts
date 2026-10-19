import posthog from "posthog-js";

import { baseProperties, posthogConfig } from "@/lib/analytics-config";

// Product analytics (PostHog). Runs in the browser before the app hydrates.
// Off unless the project token is set, so local runs, tests and CI send
// nothing. Which deployments send is decided by where the token is set in
// Vercel; every event carries `environment` so previews can be filtered out.
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (token) {
  try {
    posthog.init(token, {
      ...posthogConfig(),
      loaded: (instance) => instance.register(baseProperties()),
    });
  } catch (error) {
    // Analytics must never break the app; the failure is still visible.
    console.warn(JSON.stringify({ event: "analytics_init_failed", message: String(error) }));
  }
}
