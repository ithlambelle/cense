// The card page from the approved frame (Figma 144:2904), walked as a student:
// the issuer's rules open from "Show 1 more" and stay readable, the lesson
// link opens the preapproval answer and Back returns to the same card page,
// and a tracked card's status is a quiet text action that still works.
// Each test fails on the code before this change.
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function track(page: Page, status: string) {
  const res = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status, creditLimitCents: null },
  });
  expect(res.status(), await res.text()).toBe(201);
}

test("a signed-out student reads the card's type, issuer and every approval rule", async ({ page }) => {
  await page.goto(`/cards/${DISCOVER.id}`);
  await expect(page.getByRole("heading", { level: 1, name: DISCOVER.name })).toBeVisible();
  await expect(page.getByText("Student credit card · Discover", { exact: true })).toBeVisible();

  const box = page.getByRole("region", { name: "What the issuer looks for" });
  await expect(box.getByRole("listitem")).toHaveCount(1);
  await box.getByRole("button", { name: "Show 1 more" }).click();
  await expect(box.getByRole("listitem")).toHaveCount(2);
  await expect(box.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  await box.getByRole("button", { name: "Show less" }).click();
  await expect(box.getByRole("listitem")).toHaveCount(1);

  // Learn needs an account, so a signed-out visit has no lesson link.
  await expect(page.getByRole("link", { name: /What is preapproval\?/ })).toHaveCount(0);
  await axeChecker(page)("card page signed out");
});

test("the lesson link opens the preapproval answer, and Back returns to the card page it came from", async ({ page }) => {
  await signUp(page, uniqueEmail("card-lesson"), async () => {});
  await page.goto(`/cards/${DISCOVER.id}?from=home`);
  await page.getByRole("link", { name: /What is preapproval\?/ }).click();
  await expect(page).toHaveURL(/\/learn\/penny\?answer=preapproval-vs-applying/);
  await expect(page.getByText("Preapproval vs. applying").first()).toBeVisible();

  await page.getByRole("link", { name: `Back to ${DISCOVER.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}\\?from=home$`));
  // The card page's own Back still knows it was opened from Home.
  await expect(page.getByRole("link", { name: "Back to Home" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: DISCOVER.name })).toBeVisible();
});

test("a tracked card's Update status is a text action that opens the status screen", async ({ page }) => {
  await signUp(page, uniqueEmail("card-status"), async () => {});
  await track(page, "applied");
  await page.goto(`/cards/${DISCOVER.id}`);
  const status = page.getByRole("region", { name: "Your status" });
  const update = status.getByRole("link", { name: "Update status" });
  await expect(update).toBeVisible();
  // Quiet once the status is set: it no longer spans the box like the next step would.
  const [boxWidth, linkWidth] = await Promise.all([
    status.evaluate((el) => el.getBoundingClientRect().width),
    update.evaluate((el) => el.getBoundingClientRect().width),
  ]);
  expect(linkWidth).toBeLessThan(boxWidth / 2);
  await update.click();
  await expect(page).toHaveURL(/\/applications\/[^/?]+\?from=card$/);
});
