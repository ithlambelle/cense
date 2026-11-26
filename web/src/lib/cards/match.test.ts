// Created with Claude Code (2026-11-26). Catalog matching for Add a card.
import { describe, expect, it } from "vitest";

import { cardDisplayName } from "../copy/results";
import { listCards } from "./catalog";
import { catalogCardNamed, matchingCards, normalizeCardName } from "./match";

const CATALOG = listCards().map((card) => ({ id: card.id, name: cardDisplayName(card) }));
const ids = (typed: string) => matchingCards(CATALOG, typed).map((card) => card.id);

describe("matchingCards", () => {
  it("finds catalog cards with every word typed, in any order, from the second letter", () => {
    expect(ids("d")).toEqual([]);
    expect(ids("cash disc")).toContain("discover-it-student-cash-back");
    expect(ids("CHASE  freedom rise")).toEqual(["chase-freedom-rise"]);
    expect(ids("Campus CU Visa")).toEqual([]);
    expect(ids("disc stu cash").length).toBeLessThanOrEqual(5);
  });

  it("reads the ways students write a card's name", () => {
    expect(ids("discover student cashback")).toContain("discover-it-student-cash-back");
    expect(ids("chase freedom rise card")).toEqual(["chase-freedom-rise"]);
    expect(ids("chase freedom rise credit card")).toEqual(["chase-freedom-rise"]);
    expect(ids("amex blue cash").length).toBeGreaterThan(0);
    expect(matchingCards(CATALOG, "amex").every((card) => card.name.startsWith("American Express"))).toBe(true);
    expect(matchingCards(CATALOG, "bofa").every((card) => card.name.startsWith("Bank of America"))).toBe(true);
    expect(matchingCards(CATALOG, "boa").length).toBeGreaterThan(0);
    expect(matchingCards(CATALOG, "cap one quicksilver").every((card) => card.name.startsWith("Capital One"))).toBe(true);
    expect(matchingCards(CATALOG, "cap one quicksilver").length).toBeGreaterThan(0);
    expect(matchingCards(CATALOG, "us bank cash").length).toBeGreaterThan(0);
  });
});

describe("catalogCardNamed", () => {
  it("finds the card a whole name stands for, and nothing for part of one", () => {
    expect(catalogCardNamed(CATALOG, "discover it student cashback card")?.id).toBe("discover-it-student-cash-back");
    expect(catalogCardNamed(CATALOG, "Chase Freedom Rise")?.id).toBe("chase-freedom-rise");
    expect(catalogCardNamed(CATALOG, "Discover it Student")).toBeNull();
    expect(catalogCardNamed(CATALOG, "card")).toBeNull();
    expect(catalogCardNamed(CATALOG, "   ")).toBeNull();
  });

  it("normalizes both sides the same way", () => {
    expect(normalizeCardName("Apple Card")).toBe("apple");
    expect(normalizeCardName("U.S. Bank Cash+ Visa Signature Card")).toBe("us bank cash visa signature");
    expect(normalizeCardName("Amex")).toBe("american express");
  });
});
