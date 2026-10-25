// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listCards } from "@/lib/cards/catalog";
import { ROUTES } from "@/lib/routes";

import { CardListView } from "./card-list-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/cards" }));

describe("CardListView", () => {
  it("puts the student's match on top, one tap from the result, with a way to retake", () => {
    render(<CardListView cards={listCards()} signedIn yourMatch={{ name: "Discover it Student Cash Back", tier: "likely_fit" }} />);
    const match = screen.getByRole("link", { name: /Your match/ });
    expect(match.getAttribute("href")).toBe(ROUTES.results);
    expect(match.textContent).toContain("Discover it Student Cash Back");
    expect(match.textContent).toContain("Fit: Likely fit");
    expect(screen.getByRole("link", { name: "Retake quiz" }).getAttribute("href")).toBe(ROUTES.quiz);
    expect(screen.queryByRole("link", { name: "Take the quiz" })).toBeNull();
  });

  it("still links to the result when no card fits", () => {
    render(<CardListView cards={listCards()} signedIn yourMatch={{ name: null, tier: "not_yet" }} />);
    expect(screen.getByRole("link", { name: /Your match/ }).getAttribute("href")).toBe(ROUTES.results);
  });

  it("offers the quiz when it is not finished", () => {
    render(<CardListView cards={listCards()} signedIn yourMatch={null} />);
    expect(screen.getByRole("link", { name: "Take the quiz" }).getAttribute("href")).toBe(ROUTES.quiz);
    expect(screen.queryByRole("link", { name: /Your match/ })).toBeNull();
  });
});
