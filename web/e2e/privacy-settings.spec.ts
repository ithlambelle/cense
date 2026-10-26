// The Analytics switch on Security and privacy, as a student: it saves to the
// profile, so it survives a reload and follows the student to a second
// browser, and a browser that sends Global Privacy Control shows it off and
// cannot turn it on. (What PostHog does with it is covered by the unit tests
// in src/lib/analytics.test.ts: these runs have no PostHog token.)
import { expect, test, type Browser, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

const ANALYTICS = { name: "Analytics" } as const;

async function openPrivacy(page: Page) {
  await page.goto("/settings");
  await page.getByRole("link", { name: "Security and privacy" }).click();
  await expect(page).toHaveURL(/\/settings\/privacy$/);
}

async function savedAnalyticsOn(page: Page): Promise<boolean> {
  const response = await page.request.get("/api/v1/me/privacy");
  expect(response.status()).toBe(200);
  return ((await response.json()) as { analyticsOn: boolean }).analyticsOn;
}

async function newBrowser(browser: Browser, globalPrivacyControl = false): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, reducedMotion: "reduce" });
  await blockExternalRequests(context);
  if (globalPrivacyControl) {
    await context.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true }));
  }
  return context.newPage();
}

test("the Analytics switch saves, survives a reload and follows the student to another browser", async ({ page, browser }) => {
  const checkA11y = axeChecker(page);
  const email = uniqueEmail("analytics-switch");
  await signUp(page, email, checkA11y);
  await openPrivacy(page);
  const toggle = page.getByRole("switch", ANALYTICS);
  await expect(toggle).toBeChecked();
  await expect(page.getByText("Taps and screen recordings that help us fix Cense. Typing is always hidden.")).toBeVisible();
  await checkA11y("security and privacy");

  // Off: saved to the profile, after a reload too.
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/v1/me/privacy") && r.request().method() === "PATCH");
  await toggle.click();
  expect((await saved).status()).toBe(200);
  await expect(toggle).not.toBeChecked();
  expect(await savedAnalyticsOn(page)).toBe(false);
  await page.reload();
  await expect(page.getByRole("switch", ANALYTICS)).not.toBeChecked();

  // Another browser, signed in as the same student, shows it off. It signs in
  // more than 5 seconds after sign-up: a code within 5 seconds of the account's
  // confirmation counts as the confirming one and ends other sessions
  // (lib/api/confirmation.ts), which no student typing a code can hit.
  await page.waitForTimeout(5_500);
  const laptop = await newBrowser(browser);
  await signUp(laptop, email, async () => {});
  await openPrivacy(laptop);
  await expect(laptop.getByRole("switch", ANALYTICS)).not.toBeChecked();

  // On again there, and here after a reload. Read back once the save answers.
  const savedOn = laptop.waitForResponse((r) => r.url().endsWith("/api/v1/me/privacy") && r.request().method() === "PATCH");
  await laptop.getByRole("switch", ANALYTICS).click();
  expect((await savedOn).status()).toBe(200);
  await expect(laptop.getByRole("switch", ANALYTICS)).toBeChecked();
  expect(await savedAnalyticsOn(laptop)).toBe(true);
  await page.reload();
  await expect(page.getByRole("switch", ANALYTICS)).toBeChecked();
  await laptop.context().close();

  // A save with no answer moves the switch back and says so.
  await page.route("**/api/v1/me/privacy", (route) => (route.request().method() === "PATCH" ? route.abort("failed") : route.fallback()));
  await page.getByRole("switch", ANALYTICS).click();
  await expect(page.getByRole("alert").filter({ hasText: "We couldn’t reach Cense" })).toBeVisible();
  await expect(page.getByRole("switch", ANALYTICS)).toBeChecked();
  expect(await savedAnalyticsOn(page)).toBe(true);

  // The back arrow returns to Your account.
  await page.getByRole("link", { name: "Back to Your account" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("a browser that sends Global Privacy Control shows analytics off and cannot turn it on", async ({ browser }) => {
  const page = await newBrowser(browser, true);
  await signUp(page, uniqueEmail("analytics-gpc"), async () => {});
  await openPrivacy(page);
  const toggle = page.getByRole("switch", ANALYTICS);
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeDisabled();
  await expect(page.getByText("Off: your browser asks sites not to track you.")).toBeVisible();
  // The account's own choice is untouched: it is the browser that says no.
  expect(await savedAnalyticsOn(page)).toBe(true);
  await axeChecker(page)("security and privacy: browser signal");
  await page.context().close();
});

test("the privacy setting refuses a signed-out caller and a bad value", async ({ page }) => {
  expect((await page.request.get("/api/v1/me/privacy")).status()).toBe(401);
  expect((await page.request.patch("/api/v1/me/privacy", { data: { analyticsOn: false } })).status()).toBe(401);
  await signUp(page, uniqueEmail("analytics-bad"), async () => {});
  expect((await page.request.patch("/api/v1/me/privacy", { data: { analyticsOn: "no" } })).status()).toBe(400);
  expect((await page.request.patch("/api/v1/me/privacy", { data: {} })).status()).toBe(400);
  expect(await savedAnalyticsOn(page)).toBe(true);
});
