// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";
import { SENSITIVE } from "@/lib/analytics";
import { findCard } from "@/lib/cards/catalog";
import { cardRewards } from "@/lib/cards/rewards";
import { ESTIMATE_DISCLAIMER } from "@/lib/copy/results";
import { estimateYearOne } from "@/lib/results/value";

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

  it("shows the issuer's card art, or a plain card when there is none", () => {
    const { container, unmount } = render(
      <CardDetailView card={catalogCard("discover-it-student-cash-back")} signedIn rewards={cardRewards("discover-it-student-cash-back")} />,
    );
    expect(container.querySelector('img[src*="discover-it-student-cash-back"]')).not.toBeNull();
    unmount();
    render(<CardDetailView card={catalogCard("chime-card")} signedIn rewards={cardRewards("chime-card")} />);
    expect(screen.getByTestId("card-art-fallback")).toBeTruthy();
  });

  it("lists what the card earns and its sign-up bonus, in the issuer's words", () => {
    const rewards = cardRewards("capital-one-savor-students");
    if (!rewards?.bonus) throw new Error("expected rewards with a bonus");
    render(<CardDetailView card={catalogCard("capital-one-savor-students")} signedIn rewards={rewards} />);
    const box = within(screen.getByRole("region", { name: "Rewards" }));
    expect(box.getAllByRole("listitem")).toHaveLength(rewards.rates.length);
    for (const rate of rewards.rates) expect(box.getByText(rate.category)).toBeTruthy();
    expect(box.getByText(rewards.bonus.summary)).toBeTruthy();
    // No spending answer: no estimate.
    expect(box.queryByText(/in your first year/)).toBeNull();
  });

  it("adds the student's year-one estimate, masked from session replay, when they answered spending", () => {
    const rewards = cardRewards("capital-one-savor-students");
    const estimate = estimateYearOne(rewards, { categories: ["groceries"], band: "200_to_500" });
    render(<CardDetailView card={catalogCard("capital-one-savor-students")} signedIn rewards={rewards} estimate={estimate} />);
    const box = within(screen.getByRole("region", { name: "Rewards" }));
    const line = box.getByText(/in your first year/);
    expect(line.textContent).toMatch(/^About \$\d+ in your first year$/);
    expect(line.closest(`.${SENSITIVE}`)).not.toBeNull();
    expect(box.getByText("From your groceries")).toBeTruthy();
    expect(box.getByText(ESTIMATE_DISCLAIMER)).toBeTruthy();
  });

  it("says plainly when a card earns no rewards", () => {
    render(<CardDetailView card={catalogCard("capital-one-platinum")} signedIn rewards={cardRewards("capital-one-platinum")} />);
    expect(within(screen.getByRole("region", { name: "Rewards" })).getByText("No rewards on purchases.")).toBeTruthy();
  });

  it("shows the issuer's first approval rule and opens the rest from Show more (James, Oct 26)", () => {
    const card = catalogCard("discover-it-student-cash-back");
    const rules = card.conditions.filter((condition) => condition.affects === "approval");
    expect(rules.length).toBeGreaterThan(1);
    render(<CardDetailView card={card} signedIn={false} />);
    const box = screen.getByRole("region", { name: "What the issuer looks for" });
    expect(box.querySelectorAll("li")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: `Show ${rules.length - 1} more` }));
    expect(box.querySelectorAll("li")).toHaveLength(rules.length);
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
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
