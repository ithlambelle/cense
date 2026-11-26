// Created with Claude Code (2026-11-26). Where Ask Penny's back arrow goes,
// including Your match and a card's page, where "What is a secured card?" opens it.
import { describe, expect, it } from "vitest";

import { pennyBackLink, PENNY_FROM_RESULTS } from "./navigation";

describe("pennyBackLink", () => {
  it("returns to the topic it was opened from", () => {
    expect(pennyBackLink("credit")).toEqual({ href: "/learn/credit", label: "Credit" });
  });

  it("returns to Your match, or to the catalog card's page it was opened from", () => {
    expect(pennyBackLink(PENNY_FROM_RESULTS)).toEqual({ href: "/results", label: "Your match" });
    expect(pennyBackLink("discover-it-secured-cash-back")).toEqual({
      href: "/cards/discover-it-secured-cash-back",
      label: "Card details",
    });
  });

  it("falls back to Learn for anything else, a card that is not in the catalog included", () => {
    for (const from of [undefined, "learn", "not-a-card", "https://evil.example", ["credit", "results"]]) {
      expect(pennyBackLink(from)).toEqual({ href: "/learn", label: "Learn" });
    }
  });
});
