import { describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";

import PlanPage from "./page";

// redirect() ends the render by throwing, as Next's does.
const redirect = vi.hoisted(() => vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/api/auth", () => ({ authenticatedStudent: async () => ({ studentId: "s", email: null, supabase: {} }) }));

let applications: Application[] = [];
vi.mock("@/lib/student-data", () => ({
  loadStudentSnapshot: async () => ({ applications, quiz: { kind: "quiz_unfinished" }, quizAnswered: 0 }),
}));

function app(id: string, status: Application["status"], statusUpdatedAt: string): Application {
  return {
    id: `00000000-0000-4000-8000-00000000000${id}`,
    cardId: null,
    cardName: `Card ${id}`,
    status,
    creditLimitCents: null,
    appliedAt: null,
    statusUpdatedAt,
  };
}

async function target(application?: string | string[]): Promise<string> {
  try {
    await PlanPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(application === undefined ? {} : { application }),
    } as Parameters<typeof PlanPage>[0]);
  } catch (error) {
    return String((error as Error).message).replace("redirect:", "");
  }
  throw new Error("expected a redirect");
}

describe("PlanPage, retired", () => {
  const older = app("1", "approved", "2026-10-01T00:00:00Z");
  const newer = app("2", "approved", "2026-10-10T00:00:00Z");

  it("opens the setup list of the approved card in the address", async () => {
    applications = [newer, older];
    expect(await target(older.id)).toBe(`/applications/${older.id}/setup`);
  });

  it("falls back to the newest approved card for a missing, invalid or unknown id", async () => {
    applications = [older, newer];
    expect(await target()).toBe(`/applications/${newer.id}/setup`);
    expect(await target("not-an-id")).toBe(`/applications/${newer.id}/setup`);
    expect(await target("00000000-0000-4000-8000-000000000999")).toBe(`/applications/${newer.id}/setup`);
  });

  it("goes Home when no card is approved", async () => {
    applications = [app("3", "rejected", "2026-10-12T00:00:00Z")];
    expect(await target("00000000-0000-4000-8000-000000000003")).toBe("/home");
  });
});
