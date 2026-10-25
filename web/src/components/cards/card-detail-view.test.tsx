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

const TRACKED: Application = {
  id: "00000000-0000-4000-8000-000000000001",
  cardId: "discover-it-student-cash-back",
  cardName: "Discover it Student Cash Back",
  status: "approved",
  creditLimitCents: 50000,
  appliedAt: null,
  statusUpdatedAt: "2026-10-25T00:00:00Z",
};

describe("CardDetailView", () => {
  it("opens an approved card's payment reminders from its page, saying whether they are on", () => {
    const card = catalogCard("discover-it-student-cash-back");
    const { unmount } = render(<CardDetailView card={card} signedIn tracked={TRACKED} reminders="not_set" />);
    const row = screen.getByRole("link", { name: /^Payment reminders/ });
    expect(row.getAttribute("href")).toBe(`/applications/${TRACKED.id}/reminders?from=card`);
    expect(row.textContent).toContain("Not set yet");
    unmount();
    render(<CardDetailView card={card} signedIn tracked={TRACKED} reminders="on" from="home" />);
    const opened = screen.getByRole("link", { name: /^Payment reminders/ });
    expect(opened.textContent).toContain("On");
    // the page's own origin goes along, so Back from the reminder screen keeps it
    expect(opened.getAttribute("href")).toBe(`/applications/${TRACKED.id}/reminders?from=card&card_from=home`);
  });

  it("has no reminder row for a card that is not approved", () => {
    const card = catalogCard("discover-it-student-cash-back");
    render(<CardDetailView card={card} signedIn tracked={{ ...TRACKED, status: "applied", creditLimitCents: null }} />);
    expect(screen.queryByRole("link", { name: /^Payment reminders/ })).toBeNull();
  });

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
