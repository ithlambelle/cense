// Google sign-in on Cense's own address: tapping Continue with Google sends
// the student to Google with Cense as the place Google returns them to, never
// the Supabase project, so Google's account chooser names Cense
// (src/lib/auth/google.ts). The test stops at Google's door: Google itself is
// never reached (blockExternalRequests answers with a stand-in page).
//
// The app must be started with GOOGLE_OAUTH_CLIENT_ID and _SECRET set to any
// made-up values, and E2E_GOOGLE_OAUTH_CLIENT_ID set to the same id (CI does
// this). Locally, without it, this file is skipped; in CI it is required.
import { expect, test } from "@playwright/test";

import { axeChecker, blockExternalRequests } from "./helpers";

const CLIENT_ID = process.env.E2E_GOOGLE_OAUTH_CLIENT_ID;

test.skip(!CLIENT_ID && !process.env.CI, "Start the app with GOOGLE_OAUTH_CLIENT_ID and _SECRET, and set E2E_GOOGLE_OAUTH_CLIENT_ID (web/.env.example).");

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

test("Continue with Google sends the student to Google with Cense, not supabase.co, as the return address", async ({ page, baseURL }) => {
  const checkA11y = axeChecker(page);
  await page.goto("/sign-in?next=%2Fhome");
  await checkA11y("sign in");

  const toGoogle = page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).hostname === "accounts.google.com");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  const google = new URL((await toGoogle).url());

  expect(google.pathname).toBe("/o/oauth2/v2/auth");
  expect(google.searchParams.get("client_id")).toBe(CLIENT_ID);
  expect(google.searchParams.get("redirect_uri")).toBe(new URL("/api/v1/auth/google/callback", baseURL).toString());
  expect(google.searchParams.get("prompt")).toBe("select_account");
  expect(google.toString()).not.toMatch(/supabase|127\.0\.0\.1:54321/);
});

test("backing out at Google returns to sign in with a clear message", async ({ page }) => {
  await page.goto("/sign-in");
  const toGoogle = page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).hostname === "accounts.google.com");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  const state = new URL((await toGoogle).url()).searchParams.get("state");

  // What Google sends back when the student closes its chooser.
  await page.goto(`/api/v1/auth/google/callback?error=access_denied&state=${state}`);
  await expect(page).toHaveURL(/\/sign-in\?error=cancelled$/);
  await expect(page.getByText("Google sign-in was canceled. Try again, or use an email code.")).toBeVisible();
});

test("a sign-in link that did not start in this browser is refused", async ({ page }) => {
  // A forged return from Google: a code with a state this browser never made.
  await page.goto("/api/v1/auth/google/callback?code=forged-code&state=forged-state");
  await expect(page).toHaveURL(/\/sign-in\?error=callback$/);
  await expect(page.getByText("Google sign-in didn’t finish. Try again, or use an email code.")).toBeVisible();
  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(401);
});
