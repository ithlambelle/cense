import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResultView } from "@/lib/results/compute";

import ResultsPage from "./page";

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };

// "server-only" refuses to load outside a server build; this test is the server.
vi.mock("server-only", () => ({}));

let storedAnswers: unknown = null;
// The student's tracked cards (card_applications rows), or an error.
let applications: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };
vi.mock("@/lib/api/auth", () => ({
  authenticatedStudent: async () => ({
    studentId: "00000000-0000-4000-8000-0000000000ff",
    email: null,
    supabase: {
      from: (table: string) => ({
        select: () => ({
          eq: () =>
            table === "card_applications"
              ? { order: async () => applications }
              : { maybeSingle: async () => ({ data: { answers: storedAnswers }, error: null }) },
        }),
      }),
    },
  }),
}));

// Saving is tested in save.test.ts; here it only has to be called with the kept answers.
const saveRecommendation = vi.fn(async () => "saved");
vi.mock("@/lib/results/save", () => ({ saveRecommendation: (...args: unknown[]) => saveRecommendation(...(args as [])) }));

type ViewProps = { view: ResultView; topTracked: boolean };

async function propsFor(answers: unknown): Promise<ViewProps> {
  storedAnswers = answers;
  const element = await ResultsPage();
  if (!isValidElement<ViewProps>(element)) throw new Error("expected the result view");
  return element.props;
}

async function viewFor(answers: unknown): Promise<ResultView> {
  return (await propsFor(answers)).view;
}

function applicationRow(cardId: string, status: "applied" | "approved" | "rejected") {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    card_id: cardId,
    card_name: null,
    status,
    credit_limit_cents: null,
    applied_at: null,
    updated_at: "2026-11-18T00:00:00Z",
  };
}

afterEach(() => {
  applications = { data: [], error: null };
  vi.restoreAllMocks();
});

describe("ResultsPage", () => {
  it("works the result out from the valid answers of a draft the schema now rejects", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await viewFor({ ...ALL_SIX, retiredField: "x" })).kind).toBe("match");
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("asks to finish the quiz when a dropped answer leaves it incomplete", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await viewFor({ ...ALL_SIX, incomeBand: "lots" })).kind).toBe("quiz_unfinished");
  });

  it("shows the same result as before for a draft that is already valid", async () => {
    const warn = vi.spyOn(console, "warn");
    expect((await viewFor(ALL_SIX)).kind).toBe("match");
    expect(warn).not.toHaveBeenCalled();
  });

  it("saves the result from the kept answers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    saveRecommendation.mockClear();
    await viewFor({ ...ALL_SIX, retiredField: "x" });
    expect(saveRecommendation).toHaveBeenCalledOnce();
    expect((saveRecommendation.mock.calls[0] as unknown[])[1]).toEqual(ALL_SIX);
  });

  it("marks the top match tracked only when the student tracks that card, as the card page does", async () => {
    const top = await viewFor(ALL_SIX);
    if (top.kind !== "match") throw new Error("expected a match");
    const topId = top.options[0].card.id;
    expect((await propsFor(ALL_SIX)).topTracked).toBe(false);
    applications = { data: [applicationRow("another-card", "applied")], error: null };
    expect((await propsFor(ALL_SIX)).topTracked).toBe(false);
    for (const status of ["applied", "rejected"] as const) {
      applications = { data: [applicationRow(topId, status)], error: null };
      expect((await propsFor(ALL_SIX)).topTracked, status).toBe(true);
    }
  });

  it("never offers a card the student already has, and saves what it shows", async () => {
    const top = await viewFor(ALL_SIX);
    if (top.kind !== "match") throw new Error("expected a match");
    const topId = top.options[0].card.id;
    applications = { data: [applicationRow(topId, "approved")], error: null };
    saveRecommendation.mockClear();
    const props = await propsFor(ALL_SIX);
    if (props.view.kind !== "match") throw new Error("expected a match");
    expect(props.view.options.map((option) => option.card.id)).not.toContain(topId);
    expect(props.topTracked).toBe(false);
    const saved = (saveRecommendation.mock.calls[0] as unknown[])[2] as { id: string }[];
    expect(saved.map((card) => card.id)).not.toContain(topId);
  });

  it("still shows the match, with the buttons, when the tracked cards cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    applications = { data: null, error: { message: "down" } };
    const props = await propsFor(ALL_SIX);
    expect(props.view.kind).toBe("match");
    expect(props.topTracked).toBe(false);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: "results_applications_read_failed" }));
  });
});
