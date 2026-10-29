import { expect, test } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

for (const limit of ["$1,250.50", ""]) {
  test(`add a card with ${limit || "no"} credit limit, then reload`, async ({ page }) => {
    await signUp(page, uniqueEmail("add-limit"), async () => {});
    await page.goto("/home/add-card");
    await page.getByLabel("Card name").fill("Student Cash Card");
    const field = page.getByLabel("Credit limit (optional)");
    await field.fill(limit);
    await expect(field.locator("xpath=ancestor::*[contains(@class, 'ph-sensitive')]")).toHaveCount(1);
    await axeChecker(page)("add card: optional credit limit");
    await test.info().attach("add-card", { body: await page.screenshot(), contentType: "image/png" });
    const saved = page.waitForResponse((response) => response.url().endsWith("/api/v1/applications") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Add card", exact: true }).click();
    expect((await saved).status()).toBe(201);
    await expect(page).toHaveURL(/\/home$/);
    await page.reload();
    const response = await page.request.get("/api/v1/applications");
    expect(response.status()).toBe(200);
    const { applications: cards } = await response.json();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ cardName: "Student Cash Card", status: "approved", creditLimitCents: limit ? 125050 : null });
    await expect(page.getByRole("region", { name: "Student Cash Card" })).toBeVisible();
    if (limit) await expect(page.getByRole("region", { name: "Student Cash Card" }).getByText("$1,250.50")).toBeVisible();

    // A second card keeps its own limit; it must not overwrite the first.
    await page.goto("/home/add-card");
    await page.getByLabel("Card name").fill("Second Card");
    await page.getByLabel("Credit limit (optional)").fill("500");
    await page.getByRole("button", { name: "Add card", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await page.reload();
    const { applications: two } = await (await page.request.get("/api/v1/applications")).json();
    expect(two).toHaveLength(2);
    expect(two).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardName: "Student Cash Card", creditLimitCents: limit ? 125050 : null }),
      expect.objectContaining({ cardName: "Second Card", creditLimitCents: 50000 }),
    ]));
  });
}

test("invalid and failed saves keep the entered limit, and Cancel returns Home", async ({ page }) => {
  await signUp(page, uniqueEmail("add-limit-errors"), async () => {});
  await page.goto("/home/add-card");
  await page.getByLabel("Card name").fill("Student Cash Card");
  const field = page.getByLabel("Credit limit (optional)");
  await field.fill("-500");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").filter({ hasText: /Enter the limit in dollars|Go back and check your cards/ })).toContainText("Enter the limit in dollars");
  expect((await (await page.request.get("/api/v1/applications")).json()).applications).toHaveLength(0);
  await field.fill("750");
  await page.route("**/api/v1/applications", (route) => route.request().method() === "POST" ? route.abort() : route.continue());
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Enter the limit in dollars|Go back and check your cards/ })).toContainText("Go back and check your cards");
  await expect(field).toHaveValue("750");
  await expect(field).toBeEditable();
  await expect(page.getByLabel("Card name")).toHaveValue("Student Cash Card");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});
