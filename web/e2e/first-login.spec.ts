// Created with Claude Code (2026-11-19). First sign-in (Flow 1, Figma
// 821:8408) as real new students on the local stack: the welcome (W1, W2),
// Link your bank (E1) and, after Skip for now, Your next step without a bank
// (N3). Plaid is the stand-in in support/fake-plaid.ts. Every journey here
// failed on the base branch, where a new student went straight to Home.
import type { Server } from "node:http";

import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, codeFromMailpit, mailIds, signUp, uniqueEmail } from "./helpers";
import { installFakeLink, resetFakePlaid, startFakePlaid } from "./support/fake-plaid";

let plaid: Server;

test.beforeAll(async () => {
  plaid = await startFakePlaid();
});

test.afterAll(async () => {
  await new Promise((resolve) => plaid.close(resolve));
});

test.beforeEach(async ({ context }) => {
  resetFakePlaid();
  await blockExternalRequests(context);
  await installFakeLink(context);
});

const W1 = "We’re so glad you’re here!";
const W2 = "Let’s make money make Cense!";
const N3 = "Do you have a credit card yet?";

const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

// Signs in with an email code on /sign-in (or `path`), as a returning student.
async function signIn(page: Page, email: string, path = "/sign-in") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  const seen = await mailIds(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Verification code").fill(await codeFromMailpit(email, seen));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !["/sign-in", "/sign-up", "/start"].includes(url.pathname));
}

// From W2: "Let's go", which saves the welcome and opens Link your bank.
async function letsGo(page: Page) {
  await page.getByRole("button", { name: "Let’s go" }).click();
  await expect(page).toHaveURL(/\/start\/link-bank$/);
  await expect(heading(page, "Link your bank")).toBeVisible();
}

test("a new student is welcomed once: W1, W2, Let's go, Link your bank, Skip for now, Not yet opens the quiz", async ({ page }) => {
  const checkA11y = axeChecker(page);
  const email = uniqueEmail("first-login");
  await signUp(page, email, checkA11y, { welcome: true });

  // W1: Penny's hello, then W2 by itself after about 1.5 seconds, no tap.
  await expect(page).toHaveURL(/\/start\/welcome$/);
  await expect(heading(page, W1)).toBeVisible();
  await expect(page.getByText("Hi, I’m Penny.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Let’s go" })).toHaveCount(0);
  await expect(heading(page, W2)).toBeVisible({ timeout: 4000 });
  await expect(page.getByText("First, link your bank so I can find your next step.")).toBeVisible();
  await checkA11y("first login: W2");
  // W2 waits for the student (Ben, on the W2 card).
  await page.waitForTimeout(2500);
  await expect(page).toHaveURL(/\/start\/welcome$/);
  await expect(heading(page, W2)).toBeVisible();

  // A reload mid-welcome starts it again (nothing is saved until Let's go),
  // and a tap anywhere on W1 moves on at once.
  await page.reload();
  await expect(heading(page, W1)).toBeVisible();
  await checkA11y("first login: W1");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, W2)).toBeVisible();

  // Let's go saves the welcome, then E1. A reload keeps E1.
  await letsGo(page);
  await expect(page.getByRole("link", { name: "Skip for now" })).toHaveAttribute("href", "/start/next-step");
  await checkA11y("first login: E1");
  await page.reload();
  await expect(heading(page, "Link your bank")).toBeVisible();

  // Skip for now: N3. Its back arrow returns to E1, and a reload keeps N3.
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/start\/next-step$/);
  await expect(heading(page, N3)).toBeVisible();
  await expect(page.getByText("So we know where to start. You can link your bank later from Profile.")).toBeVisible();
  await checkA11y("first login: N3");
  await page.getByRole("link", { name: "Back to Link your bank" }).click();
  await expect(heading(page, "Link your bank")).toBeVisible();
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(heading(page, N3)).toBeVisible();
  await page.reload();
  await expect(heading(page, N3)).toBeVisible();

  // Not yet: the card quiz. Its first question's back arrow returns to N3.
  await page.getByRole("link", { name: "Not yet" }).click();
  await expect(page).toHaveURL(/\/quiz\?from=start$/);
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/start\/next-step$/);
  await expect(heading(page, N3)).toBeVisible();

  // The welcome is done: /start and the welcome's own address go to the
  // usual screen, never the welcome again.
  await page.goto("/start");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/start/welcome");
  await expect(page).toHaveURL(/\/home$/);

  // Signed out and in again, on a fresh browser: no welcome.
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/home$/);
  await expect(heading(page, W1)).toHaveCount(0);
});

test("Yes, I have one opens Add a card, whose back arrow returns to N3, and the card lands on Home", async ({ page }) => {
  await signUp(page, uniqueEmail("first-login-card"), async () => {}, { welcome: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await letsGo(page);
  await page.getByRole("link", { name: "Skip for now" }).click();
  await page.getByRole("link", { name: "Yes, I have one" }).click();
  await expect(page).toHaveURL(/\/home\/add-card$/);
  await expect(heading(page, "Add a card you already have")).toBeVisible();
  await page.getByRole("link", { name: "Back to Your next step" }).click();
  await expect(heading(page, N3)).toBeVisible();
  await page.getByRole("link", { name: "Yes, I have one" }).click();
  await page.getByLabel("Card name").fill("Discover it Student Cash Back");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Discover it Student Cash Back").first()).toBeVisible();
});

test("linking a bank on first sign-in goes where linking leads today: who covers your bills", async ({ page }) => {
  await signUp(page, uniqueEmail("first-login-link"), async () => {}, { welcome: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await letsGo(page);
  await page.getByRole("button", { name: "Link your bank" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
  await expect(heading(page, "Who covers your rent?")).toBeVisible();
  // The welcome stays done.
  await page.goto("/start");
  await expect(page).toHaveURL(/\/home$/);
});

test("a new student who signs up from a link goes straight there, and is welcomed at the next usual landing", async ({ page }) => {
  const email = uniqueEmail("first-login-deep-link");
  // A signed-out visitor opening Learn is sent to sign in with next=/learn.
  await page.goto("/sign-up?next=%2Flearn");
  await page.getByLabel("Email").fill(email);
  const seen = await mailIds(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Verification code").fill(await codeFromMailpit(email, seen));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(heading(page, W1)).toHaveCount(0);
  // Every screen still opens directly: the welcome never blocks one.
  await page.goto("/home");
  await expect(page).toHaveURL(/\/home$/);
  // The next ordinary landing (the app's front door) shows it, once.
  await page.goto("/");
  await expect(page).toHaveURL(/\/start\/welcome$/);
  await expect(heading(page, W1)).toBeVisible();
});

test("with reduced motion the welcome shows its words with no movement, and still moves on", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUp(page, uniqueEmail("first-login-still"), async () => {}, { welcome: true });
  await expect(heading(page, W1)).toBeVisible();
  const still = await page.evaluate(() =>
    [...document.querySelectorAll("main img, main h1, [data-star], [data-star] > span")].map((element) => getComputedStyle(element).animationName),
  );
  expect(still.length).toBeGreaterThan(8);
  expect(new Set(still)).toEqual(new Set(["none"]));
  await expect(heading(page, W2)).toBeVisible({ timeout: 4000 });
  const stillOnW2 = await page.evaluate(() =>
    [...document.querySelectorAll("main img, main h1, main button")].map((element) => getComputedStyle(element).animationName),
  );
  expect(new Set(stillOnW2)).toEqual(new Set(["none"]));
});

for (const width of [320, 390, 430]) {
  test(`the welcome, Link your bank and N3 fit a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await signUp(page, uniqueEmail(`first-login-${width}`), async () => {}, { welcome: true });
    const fits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    };
    await expect(heading(page, W1)).toBeVisible();
    await fits();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "Let’s go" })).toBeInViewport();
    await fits();
    await letsGo(page);
    await fits();
    await page.getByRole("link", { name: "Skip for now" }).click();
    await expect(heading(page, N3)).toBeVisible();
    await expect(page.getByRole("link", { name: "Yes, I have one" })).toBeInViewport();
    await fits();
  });
}
