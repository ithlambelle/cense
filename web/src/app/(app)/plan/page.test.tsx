// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/home/state";

import PlanPage from "./page";

vi.mock("next/navigation", () => ({ usePathname: () => "/plan", redirect: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ authenticatedStudent: async () => ({ studentId: "s", email: null, supabase: {} }) }));

let applications: Application[] = [];
vi.mock("@/lib/student-data", () => ({
  loadStudentSnapshot: async () => ({ applications, quiz: { kind: "quiz_unfinished" }, quizStarted: false }),
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

async function pageFor(application?: string | string[]): Promise<ReactElement> {
  const element = await PlanPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(application === undefined ? {} : { application }),
  } as Parameters<typeof PlanPage>[0]);
  if (!isValidElement(element)) throw new Error("expected a screen");
  return element;
}

const planFor = (element: ReactElement) => (element.props as { application?: Application }).application;

describe("PlanPage", () => {
  const older = app("1", "approved", "2026-10-01T00:00:00Z");
  const newer = app("2", "approved", "2026-10-10T00:00:00Z");

  it("opens the plan for the approved card in the address", async () => {
    applications = [newer, older];
    expect(planFor(await pageFor(older.id))).toBe(older);
  });

  it("falls back to the newest approved card for a missing, invalid or unknown id", async () => {
    applications = [older, newer];
    expect(planFor(await pageFor())).toBe(newer);
    expect(planFor(await pageFor("not-an-id"))).toBe(newer);
    expect(planFor(await pageFor("00000000-0000-4000-8000-000000000999"))).toBe(newer);
  });

  it("keeps the bottom bar when no card is approved yet", async () => {
    applications = [app("3", "rejected", "2026-10-12T00:00:00Z")];
    render(await pageFor("00000000-0000-4000-8000-000000000003"));
    expect(screen.getByRole("heading", { name: "No approved card yet" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });
});
