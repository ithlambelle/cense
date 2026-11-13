// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listCards } from "@/lib/cards/catalog";
import { cardDisplayName } from "@/lib/copy/results";
import { ROUTES } from "@/lib/routes";

import { CardListView } from "./card-list-view";

// A card's link starts with its display name; the type and fee follow.
const linkName = (card: { brand: string; name: string }) =>
  new RegExp(`^${cardDisplayName(card).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

vi.mock("next/navigation", () => ({ usePathname: () => "/cards" }));

// A few cards from both groups are enough here. Rendering all 53 and then
// querying by role took seconds in jsdom and timed out on a busy machine.
const all = listCards();
const cards = [...all.filter((card) => card.catalogRole === "recommend").slice(0, 3), ...all.filter((card) => card.catalogRole === "explore").slice(0, 3)];

describe("CardListView", () => {
  it("opened from Profile, has a back arrow to Profile; as a tab, none (F6)", () => {
    const { unmount } = render(<CardListView cards={cards} signedIn fromAccount />);
    expect(screen.getByRole("link", { name: "Back to Your account" }).getAttribute("href")).toBe(ROUTES.settings);
    unmount();
    render(<CardListView cards={cards} signedIn />);
    expect(screen.queryByRole("link", { name: /^Back to/ })).toBeNull();
  });

  it("puts the student's match on top, one tap from the result, with a way to retake", () => {
    render(<CardListView cards={cards} signedIn yourMatch={{ name: "Discover it Student Cash Back", tier: "likely_fit" }} />);
    const match = screen.getByRole("link", { name: /Your match/ });
    expect(match.getAttribute("href")).toBe(ROUTES.results);
    expect(match.textContent).toContain("Discover it Student Cash Back");
    expect(match.textContent).toContain("Fit: Likely fit");
    expect(screen.getByRole("link", { name: "Retake quiz" }).getAttribute("href")).toBe("/quiz?from=cards");
    expect(screen.queryByRole("link", { name: "Take the quiz" })).toBeNull();
  });

  it("still links to the result when no card fits", () => {
    render(<CardListView cards={cards} signedIn yourMatch={{ name: null, tier: "not_yet" }} />);
    expect(screen.getByRole("link", { name: /Your match/ }).getAttribute("href")).toBe(ROUTES.results);
  });

  it("offers the quiz when it is not finished", () => {
    render(<CardListView cards={cards} signedIn yourMatch={null} />);
    expect(screen.getByRole("link", { name: "Take the quiz" }).getAttribute("href")).toBe("/quiz?from=cards");
    expect(screen.queryByRole("link", { name: /Your match/ })).toBeNull();
  });

  it("groups the cards by bank, with Discover right after Capital One and its note", () => {
    const sample = [
      ...all.filter((card) => card.brand === "Discover").slice(0, 2),
      ...all.filter((card) => card.brand === "Capital One").slice(0, 2),
      ...all.filter((card) => card.brand === "Citi").slice(0, 1),
    ];
    render(<CardListView cards={sample} signedIn />);
    const sections = screen.getAllByRole("region");
    expect(sections.map((section) => within(section).getByRole("heading", { level: 2 }).textContent)).toEqual([
      "Capital One",
      "Discover",
      "Citi",
    ]);
    const discover = screen.getByRole("region", { name: "Discover" });
    expect(discover.textContent).toContain("Now part of Capital One");
    expect(discover.textContent).toContain("2 cards");
    expect(screen.getByRole("region", { name: "Citi" }).textContent).toContain("1 card");
    const first = sample[0];
    const link = within(discover).getByRole("link", { name: linkName(first) });
    expect(link.getAttribute("href")).toBe(`/cards/${first.id}`);
  });

  it("marks the cards made for starting out", () => {
    render(<CardListView cards={cards} signedIn />);
    const starter = cards.find((card) => card.catalogRole === "recommend")!;
    const other = cards.find((card) => card.catalogRole === "explore")!;
    expect(screen.getByRole("link", { name: linkName(starter) }).textContent).toContain("Made for starting out");
    expect(screen.getByRole("link", { name: linkName(other) }).textContent).not.toContain("Made for starting out");
  });
});
