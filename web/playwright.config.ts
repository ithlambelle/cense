import { defineConfig, devices } from "@playwright/test";

// Journey tests against the running dev server and LOCAL Supabase stack
// (sign-in codes are read from Mailpit). Start both first (the app with
// npm run dev:local), then: npm run e2e
// No webServer block: the tests reuse the server already on :3300.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3300",
    viewport: { width: 390, height: 844 },
    // Entrance animations fade content in; axe would measure contrast mid-fade.
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
