import { describe, expect, it } from "vitest";

import { listCards } from "./catalog";
import { groupByIssuer, issuerStyle } from "./issuers";

describe("issuerStyle", () => {
  it("has a styled badge for every issuer in the catalog", () => {
    for (const card of listCards()) {
      expect(issuerStyle(card.brand).background, card.brand).not.toBe("#0a1045");
    }
  });

  it("falls back to initials on navy for an issuer it does not know", () => {
    expect(issuerStyle("First National Bank")).toEqual({ mark: "FNB", background: "#0a1045", color: "#ffffff" });
    expect(issuerStyle("!!!").mark).toBe("?");
  });
});

describe("groupByIssuer", () => {
  it("groups by issuer alphabetically, recommended cards first in each", () => {
    const groups = groupByIssuer([
      { id: "1", brand: "Discover", catalogRole: "explore" },
      { id: "2", brand: "Capital One", catalogRole: "explore" },
      { id: "3", brand: "Discover", catalogRole: "recommend" },
      { id: "4", brand: "Capital One", catalogRole: "explore" },
    ]);
    expect(groups.map((group) => [group.brand, group.cards.map((card) => card.id)])).toEqual([
      ["Capital One", ["2", "4"]],
      ["Discover", ["3", "1"]],
    ]);
  });

  it("keeps every catalog card exactly once", () => {
    const cards = listCards();
    const grouped = groupByIssuer(cards).flatMap((group) => group.cards);
    expect(grouped).toHaveLength(cards.length);
    expect(new Set(grouped.map((card) => card.id)).size).toBe(cards.length);
  });
});
