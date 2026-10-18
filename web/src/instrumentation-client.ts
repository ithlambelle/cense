import posthog from "posthog-js";

import { SENSITIVE_SELECTOR } from "@/lib/analytics";

// Product analytics (PostHog). Runs in the browser before the app hydrates.
// Off unless the project token is set, so local runs, tests and CI send nothing.
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (token) {
  try {
    posthog.init(token, {
      // Same-origin reverse proxy (rewrites in next.config.ts), so ad blockers
      // do not drop the funnel and no third-party host is called directly.
      api_host: "/rx",
      ui_host: "https://us.posthog.com",
      defaults: "2026-05-30",
      // Anonymous visitors get no person profile; signed-in students are
      // identified by their Supabase user id only (components/analytics).
      person_profiles: "identified_only",
      // Strips ad click ids and these query keys from captured URLs. No screen
      // puts them in the address bar today; this is a backstop.
      mask_personal_data_properties: true,
      custom_personal_data_properties: ["code", "token", "token_hash", "email"],
      session_recording: {
        // Every typed value (email, password, codes, card name, credit limit).
        maskAllInputs: true,
        // Displayed text that restates a student's answers or card status.
        maskTextSelector: SENSITIVE_SELECTOR,
      },
    });
  } catch {
    // Analytics must never break the app.
  }
}
