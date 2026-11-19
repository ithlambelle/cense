// Every answer a student picks is the Design System's Choice card (Figma
// 371:3428, change G1 on 821:8361): 56 tall, 16px corners, Inter Medium 16
// Indigo-black, 18px in from the left. Not chosen: a 1px Amethyst outline and
// nothing else, on pick-one and multi-select questions alike. Chosen: a 2px
// outline and the plain 20px Light Green check, 16px in from the right, and
// the label does not move. Measured in the browser as a student uses them.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { QUESTIONS } from "../src/lib/quiz/questions";
import { SPENDING_COPY } from "../src/lib/quiz/spending";
import { blockExternalRequests, LIKELY_FIT_PICKS, signUp, uniqueEmail } from "./helpers";

const VIOLET = "rgb(151, 64, 197)";
const INDIGO_BLACK = "rgb(15, 11, 46)";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function look(card: Locator) {
  return card.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    // The label's first text, wherever it sits inside the card.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const range = document.createRange();
    range.selectNodeContents(walker.nextNode()!);
    const label = range.getBoundingClientRect();
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    const image = element.querySelector("img");
    const check = image?.getBoundingClientRect();
    return {
      // One line: exactly the frame's 56. A long question that wraps grows
      // the card instead of being cut off; it is never shorter.
      height: lines > 1 && box.height >= 56 ? 56 : Math.round(box.height),
      radius: style.borderTopLeftRadius,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      background: style.backgroundColor,
      font: `${style.fontWeight} ${style.fontSize} ${style.color}`,
      inter: style.fontFamily.includes("Inter"),
      labelLeft: Math.round(label.left - box.left),
      check: check
        ? {
            src: image!.getAttribute("src")!.includes("choice-check.svg"),
            size: `${Math.round(check.width)}x${Math.round(check.height)}`,
            right: Math.round(box.right - check.right),
          }
        : null,
      ring: element.querySelector("circle, [src*='selection-ring']") !== null,
    };
  });
}

// The pointer is moved off the card first, so its hover tint is not measured,
// and the look is polled while the 200ms background transition settles.
async function expectDefault(card: Locator, where: string) {
  await card.page().mouse.move(0, 0);
  await expect.poll(() => look(card), { message: where }).toEqual({
    height: 56,
    radius: "16px",
    border: `1px solid ${VIOLET}`,
    background: "rgb(255, 255, 255)",
    font: `500 16px ${INDIGO_BLACK}`,
    inter: true,
    labelLeft: 18,
    check: null,
    ring: false,
  });
}

async function expectSelected(card: Locator, where: string) {
  await card.page().mouse.move(0, 0);
  await expect.poll(() => look(card), { message: where }).toEqual({
    height: 56,
    radius: "16px",
    border: `2px solid ${VIOLET}`,
    background: "rgb(255, 255, 255)",
    font: `500 16px ${INDIGO_BLACK}`,
    inter: true,
    labelLeft: 18,
    check: { src: true, size: "20x20", right: 16 },
    ring: false,
  });
}

function answer(page: Page, group: string, label: string) {
  return page.getByRole("group", { name: group }).getByRole("button", { name: label, exact: true });
}

async function track(page: Page, status: string) {
  const res = await page.request.post("/api/v1/applications", {
    data: { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back", status, creditLimitCents: null },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test("the quiz's answers are Choice cards: a 1px outline, then a 2px outline and check once chosen", async ({ page }) => {
  await signUp(page, uniqueEmail("choice-card-quiz"), async () => {});
  await page.getByRole("link", { name: "Start the quiz" }).click();

  // Question 1, nothing chosen: every card is Default, with no mark.
  const first = QUESTIONS[0];
  await expect(page.getByRole("heading", { level: 1, name: first.title })).toBeVisible();
  for (const choice of first.choices) await expectDefault(answer(page, first.title, choice.label), choice.label);

  // A tap chooses and moves on; Back shows the choice as Selected, the rest Default.
  const picked = LIKELY_FIT_PICKS[first.field]!;
  await answer(page, first.title, picked).click();
  await expect(page.getByRole("heading", { level: 1, name: QUESTIONS[1].title })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1, name: first.title })).toBeVisible();
  await expect(answer(page, first.title, picked)).toHaveAttribute("aria-pressed", "true");
  await expectSelected(answer(page, first.title, picked), `${picked}, chosen`);
  for (const choice of first.choices.filter((c) => c.label !== picked)) {
    await expectDefault(answer(page, first.title, choice.label), `${choice.label}, not chosen`);
  }

  for (const question of QUESTIONS) {
    await expect(page.getByRole("heading", { level: 1, name: question.title })).toBeVisible();
    await answer(page, question.title, LIKELY_FIT_PICKS[question.field]!).click();
  }

  // The spending question picks without moving on: an unpicked card shows
  // only its outline (no empty ring), a pick its 2px outline and check, and
  // a second tap, here from the keyboard, clears it.
  await expect(page.getByRole("heading", { level: 1, name: SPENDING_COPY.title })).toBeVisible();
  const groceries = answer(page, SPENDING_COPY.title, "Groceries");
  await expectDefault(groceries, "Groceries, not picked");
  await groceries.click();
  await expect(groceries).toHaveAttribute("aria-pressed", "true");
  await expectSelected(groceries, "Groceries, picked");
  await expectDefault(answer(page, SPENDING_COPY.title, "Travel home"), "Travel home, not picked");
  await groceries.focus();
  await page.keyboard.press("Space");
  await expect(groceries).toHaveAttribute("aria-pressed", "false");
  await expectDefault(groceries, "Groceries, cleared");
});

test("Learn's questions and the denial questions are the same Choice card", async ({ page }) => {
  await signUp(page, uniqueEmail("choice-card-elsewhere"), async () => {});

  await page.goto("/learn");
  const starter = page.getByRole("region", { name: /Penny/ }).getByRole("link").first();
  await expectDefault(starter, "Learn starter question");
  await page.goto("/learn/credit");
  await expectDefault(page.getByRole("main").getByRole("listitem").first().getByRole("link"), "topic question");

  const id = await track(page, "rejected");
  await page.goto(`/denied?application=${id}`);
  const knows = page.getByRole("button", { name: "Yes, I know the reason" });
  await expectDefault(knows, "Yes, I know the reason");
  await expectDefault(page.getByRole("link", { name: "I think it was a mistake" }), "I think it was a mistake");
  await knows.click();
  await expectSelected(knows, "Yes, I know the reason, chosen");
  const income = page.getByRole("button", { name: "Not enough income" });
  await income.press("Enter");
  await expect(income).toHaveAttribute("aria-pressed", "true");
  await expectSelected(income, "Not enough income, chosen");
  await expectDefault(page.getByRole("button", { name: "Something else" }), "Something else, not chosen");
});
