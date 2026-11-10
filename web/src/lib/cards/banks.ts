// Created with Claude Code (2026-11-10). The card list grouped by bank (S13):
// one section per brand, as students know it ("Discover", not "Capital One,
// N.A."). Ben, Nov 10: Capital One and Discover "should probably be close
// together", so Discover keeps its own section, placed right after Capital One,
// with a note that Capital One now issues it (cards.json's issuingBank).

import type { Card } from "./catalog";

export type BankGroup = {
  bank: string;
  // One short line under the bank's name, or null.
  note: string | null;
  cards: Card[];
};

// A brand that now belongs to another bank: shown right after that bank.
const PART_OF: Record<string, string> = { Discover: "Capital One" };

const NOTES: Record<string, string> = {
  Discover: "Now part of Capital One. Discover cards keep Discover’s site and app.",
};

const starterCount = (group: BankGroup) => group.cards.filter((card) => card.catalogRole === "recommend").length;

// Banks with cards made for starting out come first, the most of those first,
// then the most cards, then by name. Inside a bank, those cards come first,
// each part in catalog order.
export function groupCardsByBank(cards: Card[]): BankGroup[] {
  const byBank = new Map<string, Card[]>();
  for (const card of cards) {
    const list = byBank.get(card.brand) ?? [];
    list.push(card);
    byBank.set(card.brand, list);
  }

  const groups: BankGroup[] = [...byBank].map(([bank, list]) => ({
    bank,
    note: NOTES[bank] ?? null,
    cards: [
      ...list.filter((card) => card.catalogRole === "recommend"),
      ...list.filter((card) => card.catalogRole !== "recommend"),
    ],
  }));
  groups.sort(
    (a, b) =>
      starterCount(b) - starterCount(a) || b.cards.length - a.cards.length || a.bank.localeCompare(b.bank, "en"),
  );

  // Move each brand to sit right after the bank it is part of.
  const ordered = groups.filter((group) => !(PART_OF[group.bank] && byBank.has(PART_OF[group.bank])));
  for (const child of groups) {
    const parent = PART_OF[child.bank];
    if (!parent || !byBank.has(parent)) continue;
    ordered.splice(ordered.findIndex((group) => group.bank === parent) + 1, 0, child);
  }
  return ordered;
}

// A section id for the bank's heading ("bank-capital-one").
export function bankSectionId(bank: string): string {
  return `bank-${bank.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
