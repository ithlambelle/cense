// Sora is loaded at weight 500 only (app/layout.tsx), the heading weight in
// the typography frame. Text asking Sora for 600 got a bold the browser fakes
// by smearing the 500 glyphs (audit H-Q1): "No problem" on the waiting-on-the-
// letter screen and the reason line on the five-step plan.
import { expect, test, type Page } from "@playwright/test";

import { blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// Every visible element whose own text is set in Sora, with its weight.
async function soraWeights(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
      .filter((el) => /sora/i.test(getComputedStyle(el).fontFamily) && el.getClientRects().length > 0)
      .map((el) => ({ text: el.textContent!.trim().slice(0, 40), weight: getComputedStyle(el).fontWeight })),
  );
}

async function expectOnlyLoadedWeight(page: Page, screen: string) {
  const weights = await soraWeights(page);
  expect(weights.length, `${screen}: Sora text on the screen`).toBeGreaterThan(0);
  expect(weights.filter((w) => w.weight !== "500"), `${screen}: Sora at a weight that is not loaded`).toEqual([]);
}

test("denial screens set Sora only at its loaded weight, 500", async ({ page }) => {
  await signUp(page, uniqueEmail("sora"), async () => {});
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status: "rejected", creditLimitCents: null },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  const saved = await page.request.patch(`/api/v1/applications/${id}`, { data: { denialReason: "no_credit_history" } });
  expect(saved.status(), await saved.text()).toBe(200);
  await page.goto(`/denied/plan?application=${id}`);
  await expect(page.getByText("Reason: no credit history yet")).toBeVisible();
  await expectOnlyLoadedWeight(page, "five-step plan");

  await page.goto(`/denied/no-letter?application=${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "No problem" })).toBeVisible();
  await expectOnlyLoadedWeight(page, "no letter yet");
});
