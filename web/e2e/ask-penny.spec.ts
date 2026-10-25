// Ask Penny as a signed-up student: the Learn tab, topic pages, tapped and
// typed questions, and every edge (advice, off topic, no checked answer, a
// crisis, a slow or failed answer, offline, the daily limit, signed out).
// Typed questions go to the stand-in Claude server in support/fake-claude.ts,
// so the app must be started with ANTHROPIC_BASE_URL=http://127.0.0.1:3599
// and any ANTHROPIC_API_KEY (README, "Run the app and journey tests locally").
import type { Server } from "node:http";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { received, startFakeClaude } from "./support/fake-claude";

// The answer bank is loaded inside each test, so on code without Ask Penny the
// test fails on what the student sees, not on a missing import.
async function answerBank() {
  return import("../src/lib/penny/answers");
}

async function checkedAnswer(question: string) {
  const { PENNY_ANSWERS } = await answerBank();
  const entry = PENNY_ANSWERS.find((answer) => answer.question === question);
  if (!entry) throw new Error(`No checked answer for "${question}"`);
  return entry;
}

let fakeClaude: Server;

test.beforeAll(async () => {
  fakeClaude = await startFakeClaude();
});

test.afterAll(async () => {
  await new Promise((resolve) => fakeClaude.close(resolve));
});

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// Penny's newest answer bubble.
function lastPennyMessage(page: Page): Locator {
  return page.getByRole("log", { name: "Conversation with Penny" }).getByRole("article", { name: "Penny" }).last();
}

// The questions the page sent to Penny's API.
function pennyRequests(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/penny")) sent.push(request.postData() ?? "");
  });
  return sent;
}

// The 988 line, with a call and a text one tap away.
async function expectCrisisLine(page: Page) {
  await expect(lastPennyMessage(page)).toContainText("Call or text 988");
  await expect(lastPennyMessage(page).getByRole("link", { name: "Call 988" })).toHaveAttribute("href", "tel:988");
  await expect(lastPennyMessage(page).getByRole("link", { name: "Text 988" })).toHaveAttribute("href", "sms:988");
}

async function ask(page: Page, question: string) {
  const field = page.getByRole("textbox", { name: "Ask Penny" });
  await field.fill(question);
  await page.getByRole("button", { name: "Send" }).click();
}

test("student opens Learn from the bottom bar and gets checked answers to tapped questions", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("penny-tap"), checkA11y);

  // Learn is a tab now, beside Home and Cards.
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Home", "Cards", "Learn"]);
  await nav.getByRole("link", { name: "Learn" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole("heading", { level: 1, name: "Learn" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Learn" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Hi! I’m Penny.")).toBeVisible();
  await expect(page.getByText("Got a money question? I’m here to help.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Browse by topic" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^(Credit|Budgeting|Saving|Student loans)$/ })).toHaveText([
    "Credit",
    "Budgeting",
    "Saving",
    "Student loans",
  ]);
  await checkA11y("learn: hub");

  // A starter question: the checked answer exactly as written, with its source.
  await page.getByRole("link", { name: "How to use a credit card?" }).click();
  await expect(page).toHaveURL(/\/learn\/penny\?/);
  await expect(page.getByRole("heading", { level: 1, name: "Penny" })).toBeVisible();
  await expect(page.getByText("Penny uses AI. Educational, not financial advice.")).toBeVisible();
  const starter = await checkedAnswer("How to use a credit card?");
  const conversation = page.getByRole("log", { name: "Conversation with Penny" });
  await expect(conversation.getByRole("article", { name: "You" })).toHaveText("How to use a credit card?");
  await expect(lastPennyMessage(page)).toContainText(starter.answer);
  const source = lastPennyMessage(page).getByRole("link", { name: `Source: ${starter.source.name}` });
  await expect(source).toHaveAttribute("href", starter.source.url);
  await expect(source).toHaveAttribute("target", "_blank");
  await checkA11y("penny: tapped answer");

  // It survives a reload: the answer is in the address, not in memory.
  await page.reload();
  await expect(lastPennyMessage(page)).toContainText(starter.answer);

  // Back returns to Learn.
  await page.getByRole("link", { name: "Back to Learn" }).click();
  await expect(page).toHaveURL(/\/learn$/);

  // A topic page lists its five questions word for word (Flow 5, A1).
  await page.getByRole("link", { name: "Credit", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/credit$/);
  await expect(page.getByRole("heading", { level: 1, name: "Credit" })).toBeVisible();
  await expect(page.getByText("Short answers from Penny, each checked against an official source.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /\?$|applying$/ })).toHaveText([
    "How does a credit card work?",
    "What is a credit score?",
    "Preapproval vs. applying",
    "How do I avoid paying interest?",
    "What is a secured card?",
  ]);
  await expect(page.getByText("Educational, not financial advice.")).toBeVisible();
  await checkA11y("learn: topic");

  await page.getByRole("link", { name: "Preapproval vs. applying" }).click();
  const preapproval = await checkedAnswer("Preapproval vs. applying");
  await expect(lastPennyMessage(page)).toContainText(preapproval.answer);
  // Opened from the Credit page, so no card pointing back to it.
  await expect(page.getByRole("link", { name: /More about credit/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to Credit" }).click();
  await expect(page).toHaveURL(/\/learn\/credit$/);
  await page.getByRole("link", { name: "Back to Learn" }).click();
  await expect(page).toHaveURL(/\/learn$/);

  // A topic with no starter on the hub works too.
  await page.getByRole("link", { name: "Student loans", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Student loans" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(5);
  await checkA11y("learn: student loans");
});

test("student types questions: an AI answer with its source, advice and off-topic replies, and the 988 line", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("penny-typed"), checkA11y);
  await page.goto("/learn");

  // Empty or blank input cannot be sent.
  const hubField = page.getByRole("textbox", { name: "Ask Penny" });
  await expect(hubField).toHaveAttribute("placeholder", "Ask Penny anything...");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await hubField.fill("   ");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

  // Typed on Learn, answered in the chat with the checked answer the model
  // picked, word for word (D8): the model's own wording never shows.
  // Personal details never leave Cense.
  const before = received.length;
  await ask(page, "Will checking preapproval hurt my score? I'm jordan.lee@bu.edu, 617-555-0142");
  await expect(page).toHaveURL(/\/learn\/penny$/);
  await expect(page.getByRole("article", { name: "You" }).first()).toContainText("Will checking preapproval hurt my score?");
  const preapproval = await checkedAnswer("Preapproval vs. applying");
  await expect(lastPennyMessage(page)).toContainText(preapproval.answer);
  await expect(lastPennyMessage(page)).not.toContainText("won’t change your score");
  await expect(lastPennyMessage(page).getByRole("link", { name: `Source: ${preapproval.source.name}` })).toHaveAttribute(
    "href",
    preapproval.source.url,
  );
  const sent = received.slice(before).map((request) => request.body).join("\n");
  expect(sent).toContain("Will checking preapproval hurt my score?");
  expect(sent).not.toContain("jordan.lee@bu.edu");
  expect(sent).not.toContain("617-555-0142");
  await checkA11y("penny: typed answer");

  // The link into Learn opens the answer's topic.
  await expect(page.getByRole("link", { name: /More about credit/ })).toBeVisible();

  // Advice: the fixed reply from the frame, and two questions Penny can answer.
  await ask(page, "Should I put my savings into crypto?");
  await expect(lastPennyMessage(page)).toContainText(
    "I can explain how cards and credit work, but I can’t tell you what to do with your money. Here’s what might help:",
  );
  const suggestions = lastPennyMessage(page).getByRole("button");
  await expect(suggestions).toHaveCount(2);
  const emergencyFund = (await answerBank()).PENNY_ANSWERS.find((answer) => answer.id === "emergency-fund");
  if (!emergencyFund) throw new Error("emergency-fund missing from the answer bank");
  await expect(suggestions.first()).toHaveText(emergencyFund.question);
  await suggestions.first().click();
  await expect(lastPennyMessage(page)).toContainText(emergencyFund.answer);
  await checkA11y("penny: advice reply");

  // Off topic, and a money question with no checked answer.
  await ask(page, "What's the weather in Boston?");
  await expect(lastPennyMessage(page)).toContainText("I only know money basics");
  await ask(page, "How do mortgage points work?");
  await expect(lastPennyMessage(page)).toContainText("I don’t have a checked answer for that yet.");

  // A reply that invents a number never reaches the student either.
  await ask(page, "Is preapproval safe? ninety");
  await expect(lastPennyMessage(page)).toContainText(preapproval.answer);
  await expect(lastPennyMessage(page)).not.toContainText("90%");

  // A crisis gets the 988 line at once, checked on the phone: nothing is
  // sent, so the model is never asked.
  const beforeCrisis = received.length;
  const sentToPenny = pennyRequests(page);
  await ask(page, "my debt is so bad I want to die");
  await expectCrisisLine(page);
  await ask(page, "im going to kill my self");
  await expectCrisisLine(page);
  expect(received.length).toBe(beforeCrisis);
  expect(sentToPenny).toEqual([]);
  await checkA11y("penny: crisis");

  // Back goes to Learn.
  await page.getByRole("link", { name: "Back to Learn" }).click();
  await expect(page).toHaveURL(/\/learn$/);
});

test("Penny's slow, failed and offline answers each say what happened and offer a way on", async ({ page, context }) => {
  await signUp(page, uniqueEmail("penny-edges"), async () => {});
  const sentToPenny = pennyRequests(page);

  // A crisis typed on Learn gets the 988 line in the chat, with nothing sent.
  await page.goto("/learn");
  await ask(page, "I'd be better off dead");
  await expect(page).toHaveURL(/\/learn\/penny$/);
  await expectCrisisLine(page);
  expect(sentToPenny).toEqual([]);

  await page.goto("/learn/penny");

  // Opened with nothing asked: a greeting and two questions, never a blank page.
  await expect(lastPennyMessage(page)).toContainText("Hi! I’m Penny.");
  await expect(lastPennyMessage(page).getByRole("button")).toHaveCount(2);

  // Slow: the typing dots, then a "still thinking" line, then the answer.
  await ask(page, "slow: what is a credit score?");
  await expect(page.getByRole("status")).toContainText("Penny is thinking");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Still thinking", { timeout: 12_000 });
  await expect(lastPennyMessage(page)).toContainText("A credit score is a number", { timeout: 15_000 });

  // The model fails: Penny says so, tapped questions still work, Try again resends.
  await ask(page, "boom");
  await expect(lastPennyMessage(page)).toContainText("I can’t answer typed questions right now.");
  await expect(lastPennyMessage(page).getByRole("button", { name: "Try again" })).toBeVisible();

  // Offline: the connection message, and Try again works once back online.
  await context.setOffline(true);
  await ask(page, "What is a secured card?");
  await expect(lastPennyMessage(page)).toContainText("We couldn’t reach Cense. Check your connection, then try again.");
  await context.setOffline(false);
  await lastPennyMessage(page).getByRole("button", { name: "Try again" }).click();
  await expect(lastPennyMessage(page)).toContainText("soft inquiry");

  // Offline, a crisis still gets the 988 line.
  const sentBefore = sentToPenny.length;
  await context.setOffline(true);
  await ask(page, "I want to take my own life");
  await expectCrisisLine(page);
  expect(sentToPenny).toHaveLength(sentBefore);
  await context.setOffline(false);
});

test("after 20 typed questions in a day Penny stops answering typed ones, and tapped ones still work", async ({ page }) => {
  await signUp(page, uniqueEmail("penny-limit"), async () => {});
  for (let index = 0; index < 20; index++) {
    const response = await page.request.post("/api/v1/penny", { data: { question: `What is preapproval? ${index}` } });
    expect(response.status(), await response.text()).toBe(200);
  }
  await page.goto("/learn/penny");
  await ask(page, "What is preapproval?");
  await expect(lastPennyMessage(page)).toContainText("That’s all the typed questions I can answer today.");
  const tapped = lastPennyMessage(page).getByRole("button").first();
  const question = (await tapped.textContent()) ?? "";
  await tapped.click();
  await expect(lastPennyMessage(page)).toContainText((await checkedAnswer(question)).answer);
});

test("a signed-out visitor is sent to sign in, and a session that ends mid-chat says so", async ({ page, context }) => {
  await page.goto("/learn");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Flearn$/);

  await signUp(page, uniqueEmail("penny-signed-out"), async () => {});
  await page.goto("/learn/penny");
  await context.clearCookies();
  await ask(page, "What is a credit score?");
  await expect(lastPennyMessage(page)).toContainText("Your sign-in ended.");
  await expect(lastPennyMessage(page).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in?next=%2Flearn%2Fpenny",
  );

  // Signed out, a crisis still gets the 988 line.
  await ask(page, "kms");
  await expectCrisisLine(page);
});

test("Learn's and Penny's own controls show a focus ring from the keyboard", async ({ page }) => {
  await signUp(page, uniqueEmail("penny-focus"), async () => {});

  // Focus moved after a key press counts as keyboard focus, so the ring the
  // browser draws is the one a keyboard user sees.
  async function expectRing(control: Locator, name: string) {
    await page.keyboard.press("Tab");
    await control.focus();
    const ring = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return { keyboard: element.matches(":focus-visible"), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(ring.keyboard, `${name} has keyboard focus`).toBe(true);
    expect(ring.style, `${name} draws no ring`).not.toBe("none");
    expect(ring.width, `${name} ring width`).toBeGreaterThanOrEqual(2);
  }

  await page.goto("/learn");
  await expectRing(page.getByRole("link", { name: "Credit", exact: true }), "Learn's topic button");
  await page.goto("/learn/penny?answer=credit-score&from=learn");
  await expectRing(lastPennyMessage(page).getByRole("link", { name: /^Source:/ }), "the source link");
  await expectRing(page.getByRole("link", { name: /More about credit/ }), "the topic card");
  const field = page.getByRole("textbox", { name: "Ask Penny" });
  await expectRing(field, "the chat's question field");
  await field.fill("What is a secured card?");
  await expectRing(page.getByRole("button", { name: "Send" }), "Send");
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`Learn, a topic and the chat fit a ${viewport.width}x${viewport.height} phone`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signUp(page, uniqueEmail(`penny-fit-${viewport.width}`), async () => {});
    for (const path of ["/learn", "/learn/saving", "/learn/penny?answer=credit-score&from=learn"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Nothing scrolls sideways.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
      // Every control is at least 44 by 44.
      const small = await page.evaluate(() =>
        [...document.querySelectorAll("main a, main button, main input, nav a, header a")]
          .map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && (box.width < 44 || box.height < 44))
          .map(({ element, box }) => `${element.textContent?.trim() || element.getAttribute("aria-label")} ${Math.round(box.width)}x${Math.round(box.height)}`),
      );
      expect(small, `${path} has controls under 44px`).toEqual([]);
      // Scrolled to the end, the last thing on the page sits above what is
      // pinned to the bottom: the tab bar, or the chat's question box.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const nav = page.getByRole("navigation", { name: "Main" });
      const bottomBar = (await nav.isVisible()) ? nav : page.getByRole("form", { name: "Ask Penny" });
      const barTop = (await bottomBar.boundingBox())?.y ?? 0;
      const lastBottom = await page.evaluate(() => {
        const items = [...document.querySelectorAll("main *")].filter((element) => element.getBoundingClientRect().height > 0);
        return Math.max(...items.map((element) => element.getBoundingClientRect().bottom));
      });
      expect(lastBottom, `${path} content under the bottom bar`).toBeLessThanOrEqual(barTop);
      // Every image loaded: Penny's art moved once already (#42) and a broken
      // image has no alt text to show for it.
      await expect.poll(() => page.evaluate(() => [...document.images].filter((image) => !image.complete).length)).toBe(0);
      const broken = await page.evaluate(() => [...document.images].filter((image) => image.naturalWidth === 0).map((image) => image.currentSrc || image.src));
      expect(broken, `${path} has images that did not load`).toEqual([]);
    }
  });
}
