// Created with Claude Code (2026-11-26). Home's one next step (Demo Day step
// 9, the priority rules), as real signed-up students on the local stack with
// the stand-in Plaid bank (support/fake-plaid.ts: $500 in savings, a card,
// last month $1,800 in and less out, rent and groceries $925). The step
// changes as the student acts: link, Looks right, a goal, autopay. Fails on
// the branch before this one, where Home had no next step.
import type { Server } from "node:http";

import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";
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

// The next step card, found by its title (the region is named by it).
const step = (page: Page, title: string) => page.getByRole("region", { name: title, exact: true });
const anyStep = (page: Page) => page.getByText("Your next step", { exact: true });

async function expectStep(page: Page, title: string, why: string | RegExp, button: string, href: string | RegExp) {
  const card = step(page, title);
  await expect(card).toBeVisible();
  await expect(anyStep(page)).toHaveCount(1);
  await expect(card.getByText("Why this step first")).toBeVisible();
  await expect(card.getByText(why)).toBeVisible();
  await expect(card.getByText("Order from the r/personalfinance flowchart.")).toBeVisible();
  const link = card.getByRole("link");
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText(button);
  await expect(link).toHaveAttribute("href", href);
}

// Attached to the report; also saved to E2E_SHOTS_DIR when set, for a walk-through.
const shot = async (page: Page, name: string) => {
  const dir = process.env.E2E_SHOTS_DIR;
  const body = await page.screenshot({ fullPage: true, ...(dir ? { path: `${dir}/${name}.png` } : {}) });
  await test.info().attach(name, { body, contentType: "image/png" });
};

test("a student links a bank, checks it, picks an emergency fund, then turning on autopay moves Home's next step on", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("next-step"), checkA11y);

  // A card they already have, added by hand: approved, autopay not on yet.
  await page.goto("/home/add-card");
  await page.getByLabel("Card name").fill("Student Cash Card");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  const applicationId = ((await (await page.request.get("/api/v1/applications")).json()) as { applications: { id: string }[] }).applications[0].id;

  // 1. No bank: Link your bank, in place of the safe-to-spend invite.
  await expectStep(page, "Link your bank", "Your next steps come from your own balances and bills. Cense only reads them.", "Link your bank", "/safe-to-spend/connect");
  await expect(page.getByRole("region", { name: "See what’s safe to spend" })).toHaveCount(0);
  await checkA11y("home: link your bank");
  await shot(page, "1-link-your-bank");

  // Linking from the step reads the bank. Home before Looks right: Check your budget.
  await step(page, "Link your bank").getByRole("link").click();
  await expect(page).toHaveURL(/\/safe-to-spend\/connect$/);
  await page.getByRole("button", { name: "Link your bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Here’s what we found" })).toBeVisible();
  await page.goto("/home");
  await expectStep(page, "Check your budget", "Every step after this uses last month’s numbers, so make sure they’re right.", "Check last month", "/safe-to-spend/reading");
  await expect(page.getByRole("region", { name: "Safe to spend", exact: true })).toBeVisible();
  await shot(page, "2-check-your-budget");

  // 2. Check last month, Looks right, then an emergency fund with the suggested $1,000, accepted.
  await step(page, "Check your budget").getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: "Here’s what we found" })).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page).toHaveURL(/\/start\/goal$/);
  await page.getByRole("group", { name: "Pick a goal" }).getByRole("button", { name: "Emergency fund" }).click();
  await expect(page.getByLabel("How much?")).toHaveValue("1000");
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your plan" })).toBeVisible();
  await page.getByRole("button", { name: "Accept plan" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // 4. The card without autopay is next (the emergency fund is started).
  const autopayWhy = "Student Cash Card has no autopay yet. Paying at least the minimum on time avoids late fees and protects your credit.";
  const autopayHref = `/applications/${applicationId}/setup/autopay`;
  await expectStep(page, "Turn on autopay", autopayWhy, "Turn on autopay", autopayHref);
  await checkA11y("home: turn on autopay");
  await shot(page, "3-turn-on-autopay");
  // The same after a reload.
  await page.reload();
  await expectStep(page, "Turn on autopay", autopayWhy, "Turn on autopay", autopayHref);

  // Turn it on: the issuer's steps, "Did you turn on autopay?", Autopay is on, Back to Home.
  await step(page, "Turn on autopay").getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`${autopayHref}$`));
  await page.getByRole("link", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Yes, the minimum only" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Autopay is on" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // 9. Nothing earlier applies: the goal, accepted, opens Your plan.
  const goalsWhy = "Your plan for Emergency fund is set. Change it anytime.";
  await expectStep(page, "Your goals", goalsWhy, "See your plan", "/start/plan");
  await expect(step(page, "Turn on autopay")).toHaveCount(0);
  await checkA11y("home: your goals");
  await shot(page, "4-your-goals");

  // Back returns to Autopay is on; Forward and a reload bring the same step back.
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Autopay is on" })).toBeVisible();
  await page.goForward();
  await expectStep(page, "Your goals", goalsWhy, "See your plan", "/start/plan");
  await page.reload();
  await expectStep(page, "Your goals", goalsWhy, "See your plan", "/start/plan");

  await step(page, "Your goals").getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: "Your plan" })).toBeVisible();
  await page.goBack();
  await expectStep(page, "Your goals", goalsWhy, "See your plan", "/start/plan");
});

test("with no goal, the emergency fund comes first and its button starts one with the suggestion", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("next-step-fund"), checkA11y);
  await page.goto("/safe-to-spend/connect");
  await page.getByRole("button", { name: "Link your bank" }).click();
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page).toHaveURL(/\/start\/goal$/);
  await page.getByRole("link", { name: "Not now" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // 5. $500 in savings, under a $1,000 cushion (rent and groceries are $925).
  const fundWhy = "You have $500 in savings. A first cushion is $1,000, or a month of rent, bills and groceries if that’s more: $1,000 for you.";
  await expectStep(page, "Start your emergency fund", fundWhy, "Start my emergency fund", "/start/goal?preset=emergency_fund");
  await checkA11y("home: start your emergency fund");
  await shot(page, "5-start-emergency-fund");

  // It opens Pick a goal with Emergency fund picked and $1,000 filled in.
  await step(page, "Start your emergency fund").getByRole("link").click();
  await expect(page).toHaveURL(/\/start\/goal\?preset=emergency_fund$/);
  const goals = page.getByRole("group", { name: "Pick a goal" });
  await expect(goals.getByRole("button", { pressed: true })).toHaveText(["Emergency fund"]);
  await expect(page.getByLabel("How much?")).toHaveValue("1000");
  // Back, before saving, is Home with the same step.
  await page.goBack();
  await expectStep(page, "Start your emergency fund", fundWhy, "Start my emergency fund", "/start/goal?preset=emergency_fund");

  // Saved but not accepted: the goal is the step, and its plan is waiting.
  await step(page, "Start your emergency fund").getByRole("link").click();
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your plan" })).toBeVisible();
  await page.goto("/home");
  // The stand-in bank shows a card, so Find your first card never applies here.
  await expectStep(page, "Your goals", "Your plan for Emergency fund is ready. Accept it to set money aside each month.", "See your plan", "/start/plan");
});
