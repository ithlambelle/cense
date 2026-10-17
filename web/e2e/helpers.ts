// Created with Claude Code. Shared steps for the Playwright journey tests.
import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page } from "@playwright/test";

import { QUESTIONS, type QuizAnswers } from "../src/lib/quiz/questions";

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// A unique address per test run, so every test starts with a fresh student.
export function uniqueEmail(journey: string): string {
  return `e2e-${journey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

// Issuer sites and other third-party pages are never loaded: anything that is
// not the local app or the local Supabase stack is answered with an empty stub
// page (navigations, so the tab keeps the address it was sent to) or aborted.
export async function blockExternalRequests(context: BrowserContext) {
  await context.route(
    (url) => !LOCAL_HOSTS.has(url.hostname),
    (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>External stub</title>" })
        : route.abort("blockedbyclient"),
  );
}

// Runs axe once per distinct screen in a test and expects no violations.
export function axeChecker(page: Page) {
  const seen = new Set<string>();
  return async function checkA11y(screen: string) {
    if (seen.has(screen)) return;
    seen.add(screen);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((node) => node.target.join(" ")),
    }));
    expect(summary, `axe violations on ${screen}`).toEqual([]);
  };
}

// Polls Mailpit for a 6-digit code sent to `email` after `since` (ms).
async function codeFromMailpit(email: string, since: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const list = (await response.json()) as { messages?: { Created: string; Snippet?: string }[] };
    const message = list.messages?.find((m) => Date.parse(m.Created) >= since - 2000);
    const code = message && /\b(\d{6})\b/.exec(message.Snippet ?? "")?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in code arrived in Mailpit for ${email}`);
}

// Signs up a new student through the real UI (email code) and waits for the
// screen /start sends them to. Runs axe on both sign-up steps.
export async function signUp(page: Page, email: string, checkA11y: (screen: string) => Promise<void>) {
  await page.goto("/sign-up");
  const emailField = page.getByLabel("Email");
  await expect(emailField).toBeEditable();
  await checkA11y("sign-up: email");
  await emailField.fill(email);
  const sentAfter = Date.now();
  await page.getByRole("button", { name: "Email me a code" }).click();

  const codeField = page.getByLabel("Verification code");
  await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
  await checkA11y("sign-up: code");
  await codeField.fill(await codeFromMailpit(email, sentAfter));
  await page.getByRole("button", { name: "Verify" }).click();

  await page.waitForURL((url) => !["/sign-up", "/sign-in", "/start"].includes(url.pathname));
  await expect(page.locator("h1", { hasNotText: "Hold tight!" }).first()).toBeVisible();
}

// The labels to tap, keyed by question field. Labels come from questions.ts.
export type QuizPicks = Partial<Record<keyof QuizAnswers, string>>;

export const LIKELY_FIT_PICKS: QuizPicks = {
  under21: "18 to 20",
  incomeBand: "Under $5k",
  student: "Yes",
  standing: "None",
  recentDenial: "No",
  canDeposit: "Yes",
};

// Taps one answer per question, in order, and runs axe on each question.
export async function takeQuiz(page: Page, picks: QuizPicks, checkA11y: (screen: string) => Promise<void>) {
  for (const [index, question] of QUESTIONS.entries()) {
    const heading = page.getByRole("heading", { level: 1, name: question.title });
    await expect(heading).toBeVisible();
    await expect(page.getByText(`Question ${index + 1} of ${QUESTIONS.length}`)).toBeVisible();
    const label = picks[question.field];
    if (!label) throw new Error(`No answer picked for ${question.field}`);
    const answer = page.getByRole("group", { name: question.title }).getByRole("button", { name: label, exact: true });
    await expect(answer).toBeEnabled();
    await checkA11y(`quiz: question ${index + 1}`);
    await answer.click();
  }
  await page.waitForURL("**/results");
}
