import { describe, expect, it } from "vitest";

import { pennyBackLink, pennyFromCard } from "./navigation";

describe("pennyBackLink", () => {
  it("goes back to the topic page Penny was opened from", () => {
    expect(pennyBackLink("credit")).toEqual({ href: "/learn/credit", label: "Credit" });
  });

  it("goes back to the card page, with that page's own origin, from its lesson link", () => {
    const from = pennyFromCard("discover-it-student-cash-back", "results");
    expect(pennyBackLink(from)).toEqual({
      href: "/cards/discover-it-student-cash-back?from=results",
      label: "Discover it Student Cash Back",
    });
    expect(pennyBackLink(pennyFromCard("chime-card"))).toEqual({ href: "/cards/chime-card", label: "Chime Card" });
  });

  it("drops an origin the card page does not know", () => {
    expect(pennyBackLink("card:chime-card:elsewhere").href).toBe("/cards/chime-card");
  });

  it("falls back to Learn for an unknown card, an unknown value or none", () => {
    expect(pennyBackLink("card:not-a-card")).toEqual({ href: "/learn", label: "Learn" });
    expect(pennyBackLink("https://example.com")).toEqual({ href: "/learn", label: "Learn" });
    expect(pennyBackLink(undefined)).toEqual({ href: "/learn", label: "Learn" });
    expect(pennyBackLink(["credit", "saving"])).toEqual({ href: "/learn", label: "Learn" });
  });
});
