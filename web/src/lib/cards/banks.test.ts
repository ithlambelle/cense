import { describe, expect, it } from "vitest";

import { bankSectionId, groupCardsByBank } from "./banks";
import { listCards, type Card } from "./catalog";

const all = listCards();

describe("groupCardsByBank", () => {
  it("lists every catalog card once, in the section of its brand", () => {
    const groups = groupCardsByBank(all);
    const ids = groups.flatMap((group) => group.cards.map((card) => card.id));
    expect(ids.sort()).toEqual(all.map((card) => card.id).sort());
    for (const group of groups) expect(new Set(group.cards.map((card) => card.brand))).toEqual(new Set([group.bank]));
    expect(new Set(groups.map((group) => group.bank)).size).toBe(groups.length);
  });

  it("keeps Discover in its own section, right after Capital One, with a note", () => {
    const groups = groupCardsByBank(all);
    const banks = groups.map((group) => group.bank);
    expect(banks.indexOf("Discover")).toBe(banks.indexOf("Capital One") + 1);
    expect(groups.find((group) => group.bank === "Discover")?.note).toMatch(/part of Capital One/);
    expect(groups.find((group) => group.bank === "Capital One")?.note).toBeNull();
  });

  it("puts the cards made for starting out first in each bank, in catalog order", () => {
    for (const group of groupCardsByBank(all)) {
      const roles = group.cards.map((card) => card.catalogRole);
      expect(roles).toEqual([...roles].sort((a, b) => Number(a !== "recommend") - Number(b !== "recommend")));
      const starters = all.filter((card) => card.brand === group.bank && card.catalogRole === "recommend");
      expect(group.cards.slice(0, starters.length)).toEqual(starters);
    }
  });

  it("orders banks by cards made for starting out, then by size, then by name", () => {
    const card = (id: string, brand: string, catalogRole: Card["catalogRole"]) => ({ ...all[0], id, brand, catalogRole });
    const groups = groupCardsByBank([
      card("a1", "Zeta", "explore"),
      card("b1", "Beta", "explore"),
      card("b2", "Beta", "explore"),
      card("c1", "Alpha", "explore"),
      card("d1", "Delta", "recommend"),
    ]);
    expect(groups.map((group) => group.bank)).toEqual(["Delta", "Beta", "Alpha", "Zeta"]);
  });

  it("shows Discover with no Capital One cards as an ordinary bank", () => {
    const discover = all.filter((card) => card.brand === "Discover");
    expect(groupCardsByBank(discover).map((group) => group.bank)).toEqual(["Discover"]);
    expect(groupCardsByBank([])).toEqual([]);
  });
});

describe("bankSectionId", () => {
  it("makes a plain id from the bank's name", () => {
    expect(bankSectionId("Capital One")).toBe("bank-capital-one");
    expect(bankSectionId("U.S. Bank")).toBe("bank-u-s-bank");
  });
});
