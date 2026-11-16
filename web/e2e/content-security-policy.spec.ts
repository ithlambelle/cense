// Created with Claude Code (2026-11-17).
//
// The Content Security Policy (src/lib/security/csp.ts) breaks nothing a
// student does, and does stop an injected script. A real student signs up,
// takes the quiz, opens results and a card page, Learn and Penny, Home and
// Safe to spend's connect step with Plaid Link (the stand-in script, loaded
// from Plaid's address as the real one is), and the browser reports no
// breach of either the enforced or the report-only policy on any of them.
import type { Server } from "node:http";

import { expect, test } from "@playwright/test";

import { axeChecker, blockExternalRequests, LIKELY_FIT_PICKS, signUp, takeQuiz, uniqueEmail } from "./helpers";
import { watchCsp, type CspViolation } from "./support/csp";
import { installFakeLink, resetFakePlaid, startFakePlaid } from "./support/fake-plaid";

let plaid: Server;
let violations: CspViolation[];

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
  violations = await watchCsp(context);
});

test("every page sends a nonce policy and puts that nonce on each of its scripts", async ({ page }) => {
  for (const path of ["/", "/sign-in", "/reset-password", "/no-such-page"]) {
    const response = await page.goto(path);
    const policy = response?.headers()["content-security-policy"] ?? "";
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce, path).toBeTruthy();
    expect(policy, path).toContain("'strict-dynamic'");
    expect(policy, path).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
    expect(policy, path).toContain("frame-ancestors 'none'");
    const scripts = await page.locator("script").evaluateAll((elements) => elements.map((el) => (el as HTMLScriptElement).nonce));
    expect(scripts.length, path).toBeGreaterThan(0);
    expect(scripts.every((value) => value === nonce), path).toBe(true);
  }
  expect(violations).toEqual([]);
});

test("an injected inline script does not run", async ({ page }) => {
  await page.goto("/sign-in");
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", `<img src="/no-such-image.png" onerror="window.__injected = true">`);
  });
  await expect.poll(() => violations.some((v) => v.directive === "script-src-attr" && v.disposition === "enforce")).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
});

test("a student's whole first visit, through Plaid Link, breaks no rule of the policy", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("csp"), checkA11y);
  await page.getByRole("link", { name: "Start the quiz" }).click();
  await takeQuiz(page, LIKELY_FIT_PICKS, checkA11y);
  await expect(page.getByRole("heading", { level: 1, name: "Here’s your match" })).toBeVisible();

  const card = page.getByRole("main").getByRole("link", { name: /^View card: / }).first();
  await card.click();
  await expect(page).toHaveURL(/\/cards\/[^/]+/);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/learn");
  await expect(page.getByRole("heading", { level: 1, name: "Learn" })).toBeVisible();
  await page.getByRole("link", { name: "How to use a credit card?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Penny" })).toBeVisible();
  await expect(page.getByRole("log", { name: "Conversation with Penny" }).getByRole("article", { name: "Penny" }).last()).not.toBeEmpty();

  await page.goto("/home");
  await page.getByRole("region", { name: "See what’s safe to spend" }).getByRole("link", { name: "Try it" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/connect$/);
  await page.getByRole("button", { name: "Connect (Preview)" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
  // Link was loaded from Plaid's address and opened.
  expect(await page.evaluate(() => (window as unknown as { __fakePlaidOpened?: unknown[] }).__fakePlaidOpened?.length)).toBe(1);

  expect(violations).toEqual([]);
});
