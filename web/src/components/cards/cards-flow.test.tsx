// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CardsFlow } from "./cards-flow";

const push = vi.fn();
const router = { push, replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));

type Reply = { status: number; body: unknown };

function server(routes: Record<string, Reply>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    const reply = routes[String(url)];
    if (!reply) return new Response("crash", { status: 500 });
    return Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

// A made-up card. Not a real product and not from the catalog.
const card = {
  id: "sample-card",
  brand: "Sample Bank",
  name: "Sample Card",
  annualFeeCents: 0,
  preapprovalUrl: "https://issuer.example/preapproval",
  applyUrl: "https://issuer.example/apply",
  referralDisclosure: null,
  conditions: [],
};

const CARDS: Reply = { status: 200, body: { cards: [card] } };
const NO_CATALOG: Reply = { status: 503, body: { error: { code: "catalog_unavailable", message: "Not ready." } } };
const ME: Reply = { status: 200, body: { id: "1", email: null } };
const SIGNED_OUT: Reply = { status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } };

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe("CardsFlow", () => {
  it("shows brand, name and annual fee to a signed-out visitor, with a sign-in link", async () => {
    server({ "/api/v1/cards": CARDS, "/api/v1/me": SIGNED_OUT });
    render(<CardsFlow />);
    expect(await screen.findByRole("heading", { name: "Sample Card" })).toBeTruthy();
    expect(screen.getByText("Sample Bank")).toBeTruthy();
    expect(screen.getByText("No annual fee")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(screen.getByRole("link", { name: "Take the quiz" }).getAttribute("href")).toBe("/quiz");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("sends a signed-out visitor who taps an issuer button to sign in, opening no tab", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    server({ "/api/v1/cards": CARDS, "/api/v1/me": SIGNED_OUT });
    render(<CardsFlow />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply on Sample Bank’s site: Sample Card" }));
    expect(push).toHaveBeenCalledWith("/sign-in?next=%2Fcards%2Fsample-card");
    expect(open).not.toHaveBeenCalled();
  });

  it("shows the bottom bar and no sign-in link to a signed-in student", async () => {
    server({ "/api/v1/cards": CARDS, "/api/v1/me": ME });
    render(<CardsFlow />);
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("does not treat a failed sign-in check as signed out", async () => {
    const tab = { opener: window, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    const open = vi.fn(() => tab);
    vi.stubGlobal("open", open);
    server({ "/api/v1/cards": CARDS });
    render(<CardsFlow />);
    await screen.findByRole("heading", { name: "Sample Card" });
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    // The button tries the click and lets the server's answer decide.
    fireEvent.click(screen.getByRole("button", { name: "Apply on Sample Bank’s site: Sample Card" }));
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(push).not.toHaveBeenCalled();
  });

  it("says cards are on the way while the catalog is empty", async () => {
    server({ "/api/v1/cards": NO_CATALOG, "/api/v1/me": SIGNED_OUT });
    render(<CardsFlow />);
    expect(await screen.findByRole("heading", { name: "Cards are on the way" })).toBeTruthy();
  });

  it("gives each card's links and buttons their own names", async () => {
    server({ "/api/v1/cards": CARDS, "/api/v1/me": ME });
    render(<CardsFlow />);
    const details = await screen.findByRole("link", { name: "See details: Sample Card" });
    expect(details.getAttribute("href")).toBe("/cards/sample-card");
  });
});
