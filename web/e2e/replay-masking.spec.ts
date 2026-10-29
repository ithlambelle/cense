// Session replay masks typed values, and text inside a `ph-sensitive` element
// (lib/analytics-config.ts). A student's email shown back to them as text is
// neither, so replay recorded it on the code screen (audit H-P1-07) and on the
// "we sent a link" message after Forgot password.
import { expect, test, type Locator } from "@playwright/test";

import { blockExternalRequests, uniqueEmail } from "./helpers";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// True when replay would mask this element's text.
async function masked(element: Locator): Promise<boolean> {
  return element.evaluate((el) => el.closest(".ph-sensitive") !== null);
}

test("the email shown after sending a code or a reset link is masked in replay", async ({ page }) => {
  const email = uniqueEmail("masked");

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
  const codeLine = page.getByText(email, { exact: false });
  await expect(codeLine).toBeVisible();
  expect(await masked(codeLine), "code screen").toBe(true);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send link" }).click();
  const sentLine = page.getByRole("status").filter({ hasText: email });
  await expect(sentLine).toBeVisible();
  expect(await masked(sentLine), "reset link sent").toBe(true);
});
