// Keyboard focus is visible on every button and link (WCAG 2.4.7). Before
// this test, `outline-none` beside `focus-visible:outline-2` set Tailwind's
// --tw-outline-style to none, so focused controls measured "none 2px": no
// ring at all on every Button, back arrow and link button (audit H-P1-02).
// axe does not check focus visibility, so CI stayed green.
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

type Focused = { name: string; control: boolean; keyboard: boolean; style: string; width: number } | null;

// What has focus after one Tab, and the ring it draws. A ring on ::after
// counts: a few full-row links draw theirs on an inset pseudo-element.
async function tabOnce(page: Page): Promise<Focused> {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const own = getComputedStyle(el);
    const after = getComputedStyle(el, "::after");
    const ring = own.outlineStyle !== "none" ? own : after;
    return {
      name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
      // Buttons and links; text fields show focus as the field box turning violet.
      control: el.matches("a[href], button, [role=button], [role=checkbox], [role=switch], [role=radio]"),
      keyboard: el.matches(":focus-visible"),
      style: ring.outlineStyle,
      width: parseFloat(ring.outlineWidth),
    };
  });
}

// Tabs through the screen's controls (up to `limit`) and expects a solid ring
// at least 2px wide on each button and link that Tab reaches.
async function expectVisibleFocus(page: Page, screen: string, limit = 14) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen: string[] = [];
  for (let i = 0; i < limit; i++) {
    const focused = await tabOnce(page);
    if (!focused) break;
    if (!focused.control) continue;
    seen.push(focused.name);
    expect(focused.keyboard, `${screen}: "${focused.name}" matches :focus-visible`).toBe(true);
    expect(focused.style, `${screen}: "${focused.name}" ring style`).toBe("solid");
    expect(focused.width, `${screen}: "${focused.name}" ring width`).toBeGreaterThanOrEqual(2);
  }
  expect(seen.length, `${screen}: controls reached by Tab`).toBeGreaterThan(1);
}

test("every button and link shows a focus ring from the keyboard, and none from a tap", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  await expectVisibleFocus(page, "welcome");

  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await expectVisibleFocus(page, "sign in");

  await page.goto("/cards");
  await expect(page.getByRole("heading", { level: 1, name: "Cards" })).toBeVisible();
  await expectVisibleFocus(page, "cards, signed out");

  await signUp(page, uniqueEmail("focus"), axeChecker(page));
  await expect(page).toHaveURL(/\/home$/);
  await expectVisibleFocus(page, "home");

  await page.getByRole("link", { name: "Start the quiz" }).click();
  await expect(page.getByText("Question 1 of", { exact: false })).toBeVisible();
  await expectVisibleFocus(page, "quiz");

  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expectVisibleFocus(page, "settings");

  // A tap focuses the control too, but :focus-visible stays off, so no ring.
  await page.goto("/cards");
  const card = page.getByRole("link", { name: /Discover it Student Cash Back/ });
  await card.hover();
  await page.mouse.down();
  const afterTap = await card.evaluate((el) => ({
    focused: document.activeElement === el,
    style: getComputedStyle(el).outlineStyle,
  }));
  expect(afterTap).toEqual({ focused: true, style: "none" });
  await page.mouse.up();
});
