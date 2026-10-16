// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultsFlow } from "./results-flow";

const replace = vi.fn();
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/results" }));

type Reply = { status: number; body: unknown };

// Answers by path, so the order of requests does not matter.
function server(routes: Record<string, Reply>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    const reply = routes[String(url)];
    if (!reply) return new Response("crash", { status: 500 });
    return Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const NOT_FOUND: Reply = { status: 404, body: { error: { code: "not_found", message: "Nothing saved." } } };
const SIGNED_OUT: Reply = { status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } };
const NO_CATALOG: Reply = { status: 503, body: { error: { code: "catalog_unavailable", message: "Not ready." } } };
const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
const quiz = (answers: unknown): Reply => ({ status: 200, body: { answers, updatedAt: "2026-10-11T00:00:00Z" } });

function match(fitTier: string, reason: string | null): Reply {
  return {
    status: 200,
    body: { id: "00000000-0000-4000-8000-000000000001", cardId: "sample", fitTier, reason, createdAt: "2026-10-11T00:00:00Z" },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("ResultsFlow", () => {
  it("shows the tier, the API's reason and the guidance line", async () => {
    server({
      "/api/v1/recommendations/latest": match("likely_fit", "You meet what the issuer says this card is for."),
      "/api/v1/cards/sample": NO_CATALOG,
    });
    render(<ResultsFlow />);
    expect(await screen.findByText("Likely fit")).toBeTruthy();
    expect(screen.getByText("You meet what the issuer says this card is for.")).toBeTruthy();
    expect(screen.getByText(/It is not a guarantee/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Here’s a great place to start");
  });

  it("never introduces a not yet as a great fit", async () => {
    server({
      "/api/v1/recommendations/latest": match("not_yet", "This card is only for students."),
      "/api/v1/cards/sample": NO_CATALOG,
    });
    render(<ResultsFlow />);
    expect(await screen.findByText("Not yet")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Not quite yet");
    expect(screen.queryByText("Why it fits you")).toBeNull();
  });

  it("leaves out the reason heading when the API sends no reason", async () => {
    server({ "/api/v1/recommendations/latest": match("likely_fit", null), "/api/v1/cards/sample": NO_CATALOG });
    render(<ResultsFlow />);
    expect(await screen.findByText("Likely fit")).toBeTruthy();
    expect(screen.queryByText("Why it fits you")).toBeNull();
    expect(screen.getByText(/It is not a guarantee/)).toBeTruthy();
  });

  it("still shows the match when the card's details cannot be read", async () => {
    server({ "/api/v1/recommendations/latest": match("stretch", "A reason.") });
    render(<ResultsFlow />);
    expect(await screen.findByText("Stretch")).toBeTruthy();
    expect(screen.getByText(/can’t show this card’s details/)).toBeTruthy();
  });

  it("says the answers are saved when the quiz is done and no match exists yet", async () => {
    server({ "/api/v1/recommendations/latest": NOT_FOUND, "/api/v1/quiz": quiz(ALL_SIX) });
    render(<ResultsFlow />);
    expect(await screen.findByRole("heading", { name: "Your answers are saved" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Take the quiz" })).toBeNull();
  });

  it("invites the quiz when it is unfinished or not started", async () => {
    server({ "/api/v1/recommendations/latest": NOT_FOUND, "/api/v1/quiz": quiz({ under21: true }) });
    const first = render(<ResultsFlow />);
    expect((await screen.findByRole("link", { name: "Take the quiz" })).getAttribute("href")).toBe("/quiz");
    first.unmount();

    server({ "/api/v1/recommendations/latest": NOT_FOUND, "/api/v1/quiz": NOT_FOUND });
    render(<ResultsFlow />);
    expect(await screen.findByRole("heading", { name: "No card match yet" })).toBeTruthy();
  });

  it("does not claim there is no quiz when the quiz could not be read", async () => {
    server({ "/api/v1/recommendations/latest": NOT_FOUND });
    render(<ResultsFlow />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No card match yet" })).toBeNull();
  });

  it("sends a signed-out student to sign in, with a way back to results", async () => {
    server({ "/api/v1/recommendations/latest": SIGNED_OUT });
    render(<ResultsFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fresults"));
  });

  it("ends in a retry, not an endless loading line, when the load itself breaks", async () => {
    // An empty card id makes the client refuse to build the request.
    server({
      "/api/v1/recommendations/latest": {
        status: 200,
        body: { id: "1", cardId: "", fitTier: "stretch", reason: "A reason.", createdAt: "2026-10-11T00:00:00Z" },
      },
    });
    render(<ResultsFlow />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
