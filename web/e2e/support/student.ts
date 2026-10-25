// Test students for the quality suite, made through the app's own API (the
// same calls the screens make), so every screen can be reached in every state
// in seconds. Local stack only: sign-in codes come from Mailpit.
import { expect, type Page } from "@playwright/test";

import type { QuizAnswers } from "../../src/lib/quiz/questions";

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

export const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };
export const CHIME = { id: "chime-card", name: "Chime Card" };
export const PLATINUM = { id: "capital-one-platinum", name: "Capital One Platinum" };

export const MATCH: QuizAnswers = {
  under21: true,
  incomeBand: "under_5k",
  student: true,
  standing: "none",
  recentDenial: false,
  canDeposit: true,
} as QuizAnswers;

async function mailIds(email: string): Promise<Set<string>> {
  const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as {
    messages?: { ID: string }[];
  };
  return new Set((list.messages ?? []).map((m) => m.ID));
}

async function newCode(email: string, seen: Set<string>): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as {
      messages?: { ID: string; Snippet?: string }[];
    };
    const code = /\b(\d{6})\b/.exec(list.messages?.find((m) => !seen.has(m.ID))?.Snippet ?? "")?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

// Signs a fresh student in on this page's browser context (cookies land in it).
export async function signIn(page: Page, label: string): Promise<string> {
  const email = `qa-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const seen = await mailIds(email);
  const sent = await page.request.post("/api/v1/auth/email", { data: { email } });
  expect(sent.ok(), await sent.text()).toBe(true);
  const verified = await page.request.post("/api/v1/auth/email/verify", { data: { email, code: await newCode(email, seen) } });
  expect(verified.ok(), await verified.text()).toBe(true);
  return email;
}

async function call(page: Page, method: "post" | "put" | "patch", path: string, data?: unknown) {
  const response = await page.request.fetch(`/api/v1${path}`, { method, data });
  expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${await response.text()}`).toBe(true);
  return response.status() === 204 ? null : ((await response.json().catch(() => null)) as Record<string, unknown> | null);
}

export async function saveQuiz(page: Page, answers: Partial<QuizAnswers>) {
  await call(page, "put", "/quiz", { answers });
}

export async function track(
  page: Page,
  card: { id: string; name: string },
  status: "applied" | "approved" | "rejected",
  creditLimitCents: number | null = null,
): Promise<string> {
  const created = await call(page, "post", "/applications", { cardId: card.id, cardName: card.name, status, creditLimitCents });
  return String(created?.id);
}

export async function patchApplication(page: Page, id: string, body: Record<string, unknown>) {
  await call(page, "patch", `/applications/${id}`, body);
}

export async function lightStep(page: Page, id: string, plan: "first_month" | "denial", step: string) {
  await call(page, "put", `/applications/${id}/plans/${plan}/steps/${step}`);
}
