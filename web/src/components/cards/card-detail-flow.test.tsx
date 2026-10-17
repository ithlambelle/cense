// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CardDetailFlow } from "./card-detail-flow";

const push = vi.fn();
const router = { push, replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

type Reply = { status: number; body: unknown };

function server(routes: Record<string, Reply>) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const reply = routes[String(url)];
      if (!reply) return new Response("crash", { status: 500 });
      return Response.json(reply.body, { status: reply.status });
    }),
  );
}

// A made-up card. Not a real product and not from the catalog.
const CARD: Reply = {
  status: 200,
  body: {
    id: "sample-card",
    brand: "Sample Bank",
    name: "Sample Card",
    annualFeeCents: 3900,
    preapprovalUrl: null,
    applyUrl: "https://issuer.example/apply",
    referralDisclosure: null,
    runsCreditCheck: true,
    conditions: [
      { kind: "requires_bank_account", affects: "approval", text: "You must open a checking account with this bank." },
      { kind: "graduation_review", affects: "credit_building", text: "The bank reviews you for an upgrade." },
    ],
  },
};
const SIGNED_OUT: Reply = { status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } };
const MISSING: Reply = { status: 404, body: { error: { code: "not_found", message: "Card not found." } } };

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe("CardDetailFlow", () => {
  it("shows the card, its fee, its approval conditions and a way back to the list", async () => {
    server({ "/api/v1/cards/sample-card": CARD, "/api/v1/me": SIGNED_OUT });
    render(<CardDetailFlow cardId="sample-card" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Sample Card" })).toBeTruthy();
    expect(screen.getByText("$39 annual fee")).toBeTruthy();
    expect(screen.getByText("You must open a checking account with this bank.")).toBeTruthy();
    expect(screen.queryByText("The bank reviews you for an upgrade.")).toBeNull();
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/cards");
  });

  it("sends a signed-out visitor who taps Apply to sign in, opening no tab", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    server({ "/api/v1/cards/sample-card": CARD, "/api/v1/me": SIGNED_OUT });
    render(<CardDetailFlow cardId="sample-card" />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply on Sample Bank’s site: Sample Card" }));
    expect(push).toHaveBeenCalledWith("/sign-in?next=%2Fcards%2Fsample-card");
    expect(open).not.toHaveBeenCalled();
  });

  it("says so when there is no such card", async () => {
    server({ "/api/v1/cards/nope": MISSING, "/api/v1/me": SIGNED_OUT });
    render(<CardDetailFlow cardId="nope" />);
    expect(await screen.findByRole("heading", { name: "This card isn’t available" })).toBeTruthy();
  });

  it("offers a retry and the card list when the card cannot be read", async () => {
    server({ "/api/v1/me": SIGNED_OUT });
    render(<CardDetailFlow cardId="sample-card" />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse cards" }).getAttribute("href")).toBe("/cards");
  });
});
