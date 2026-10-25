// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";
import { findCard } from "@/lib/cards/catalog";

import { CardDetailView } from "./card-detail-view";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/cards", useRouter: () => router }));

function catalogCard(id: string) {
  const card = findCard(id);
  if (!card) throw new Error(`${id} is not in the catalog`);
  return card;
}

const N1 = "This issuer has no preapproval check, so applying is the only way to find out.";
const N2 = "This card has no credit check to apply.";

describe("CardDetailView", () => {
  it("shows note N2, not N1, for a card with no credit check and no preapproval (Chime)", () => {
    const card = catalogCard("chime-card");
    expect(card.runsCreditCheck).toBe(false);
    expect(card.preapprovalUrl).toBeNull();
    render(<CardDetailView card={card} signedIn />);
    expect(screen.getByText(N2)).toBeTruthy();
    expect(screen.queryByText(N1)).toBeNull();
  });

  it("shows note N1 for a card that runs a credit check and has no preapproval", () => {
    const card = catalogCard("apple-card");
    expect(card.runsCreditCheck).toBe(true);
    expect(card.preapprovalUrl).toBeNull();
    render(<CardDetailView card={card} signedIn />);
    expect(screen.getByText(N1)).toBeTruthy();
    expect(screen.queryByText(N2)).toBeNull();
  });

  it("shows neither note when the card has a preapproval check and a credit check", () => {
    render(<CardDetailView card={catalogCard("discover-it-student-cash-back")} signedIn />);
    expect(screen.queryByText(N1)).toBeNull();
    expect(screen.queryByText(N2)).toBeNull();
  });

  it("goes back to the student's match when opened from the result screen", () => {
    render(<CardDetailView card={catalogCard("discover-it-student-cash-back")} signedIn from="results" />);
    expect(screen.getByRole("link", { name: "Back to Your match" }).getAttribute("href")).toBe("/results");
  });

  it("goes back to the card list by default", () => {
    render(<CardDetailView card={catalogCard("discover-it-student-cash-back")} signedIn />);
    expect(screen.getByRole("link", { name: "Back to Cards" }).getAttribute("href")).toBe("/cards");
  });

  describe("the student's status for a tracked card", () => {
    const ID = "00000000-0000-4000-8000-000000000001";
    const tracked: Application = {
      id: ID,
      cardId: "discover-it-student-cash-back",
      cardName: "Discover it Student Cash Back",
      status: "rejected",
      creditLimitCents: null,
      appliedAt: null,
      statusUpdatedAt: "2026-10-16T00:00:00Z",
    };
    const card = () => catalogCard("discover-it-student-cash-back");

    it("shows the status pill and opens Mark result with the way back to this card", () => {
      render(<CardDetailView card={card()} signedIn tracked={tracked} />);
      const status = screen.getByRole("region", { name: "Your status" });
      expect(status.textContent).toContain("NOT APPROVED");
      expect(screen.getByRole("link", { name: "Update status" }).getAttribute("href")).toBe(`/applications/${ID}?from=card`);
    });

    it("shows nothing new for a card the student does not track", () => {
      render(<CardDetailView card={card()} signedIn tracked={null} />);
      expect(screen.queryByRole("region", { name: "Your status" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Update status" })).toBeNull();
    });

    it("shows nothing new to a signed-out visitor", () => {
      render(<CardDetailView card={card()} signedIn={false} tracked={tracked} />);
      expect(screen.queryByRole("link", { name: "Update status" })).toBeNull();
    });
  });
});
