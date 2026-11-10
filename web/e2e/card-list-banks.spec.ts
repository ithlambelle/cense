// Created with Claude Code (2026-11-10). The card list grouped by bank, walked
// as a student: every card is under its bank's heading, Discover sits right
// after Capital One with a note, a card in a bank opens its page and Back
// returns to the list.
import { expect, test, type Page } from "@playwright/test";

import { listCards } from "../src/lib/cards/catalog";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const CATALOG = listCards();

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function bankHeadings(page: Page) {
  return page.locator("main section h2").allTextContents();
}

test("Cards lists each bank once, Discover right after Capital One, every card under its bank", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await page.goto("/cards");
  await expect(page.getByRole("heading", { level: 1, name: "Cards" })).toBeVisible();
  await checkA11y("cards: by bank, signed out");

  const banks = await bankHeadings(page);
  expect(new Set(banks)).toEqual(new Set(CATALOG.map((card) => card.brand)));
  expect(new Set(banks).size).toBe(banks.length);
  expect(banks.indexOf("Discover")).toBe(banks.indexOf("Capital One") + 1);
  // Banks with student cards come first.
  expect(banks.slice(0, 3)).toEqual(["Bank of America", "Capital One", "Discover"]);

  const discover = page.getByRole("region", { name: "Discover" });
  await expect(discover.getByText("Now part of Capital One.", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Capital One" }).getByText("part of Capital One")).toHaveCount(0);

  // Every card shows once, under its own bank, with the count beside the name.
  for (const bank of banks) {
    const cards = CATALOG.filter((card) => card.brand === bank);
    const region = page.getByRole("region", { name: bank, exact: true });
    await expect(region.getByRole("link")).toHaveCount(cards.length);
    await expect(region.getByText(cards.length === 1 ? "1 card" : `${cards.length} cards`, { exact: true })).toBeVisible();
  }
  await expect(page.locator("main section").getByRole("link")).toHaveCount(CATALOG.length);

  // A student card in Discover opens its page, and Back returns to the list.
  await discover.getByRole("link", { name: /Discover it Student Cash Back/ }).click();
  await expect(page).toHaveURL(/\/cards\/discover-it-student-cash-back$/);
  await expect(page.getByRole("heading", { level: 1, name: "Discover it Student Cash Back" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/cards$/);
  await expect(page.getByRole("region", { name: "Discover" })).toBeVisible();

  // So does a card further down, in Capital One.
  const platinum = CATALOG.find((card) => card.brand === "Capital One" && card.name === "Platinum")!;
  await page.getByRole("region", { name: "Capital One" }).locator(`a[href="/cards/${platinum.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${platinum.id}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/cards$/);
});

test("signed in, the bank sections sit above the bottom bar and the student's cards still open", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("cards-by-bank"), async () => {});
  await page.goto("/cards");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await checkA11y("cards: by bank, signed in");
  expect((await bankHeadings(page)).slice(0, 3)).toEqual(["Bank of America", "Capital One", "Discover"]);

  // The last bank's last card scrolls clear of the bottom bar and opens.
  const last = page.locator("main section").last().getByRole("link").last();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [cardBox, navBox] = await Promise.all([last.boundingBox(), page.getByRole("navigation", { name: "Main" }).boundingBox()]);
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  const href = await last.getAttribute("href");
  await last.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/cards$/);
});
