// Created with Claude Code (2026-11-26). Matching what a student typed for a
// card's name against the catalog: Add a card's list as they type, and
// whether a card added by name is one in the catalog. No fuzzy matching: the
// same words, written the ways students write them.

// A catalog card as matching sees it: its id and the name students know it by
// (cardDisplayName).
export type CatalogChoice = { id: string; name: string };

// Short names students type for a bank, as whole words, to the catalog's.
const ALIASES: [RegExp, string][] = [
  [/\bamex\b/g, "american express"],
  [/\b(bofa|boa)\b/g, "bank of america"],
  [/\b(cap one|capone|cap1)\b/g, "capital one"],
  [/\bu s\b/g, "us"],
];

// Lower case, words only, "cashback" as "cash back", the aliases above, and
// no trailing "card" or "credit card": "Amex Blue Cash Everyday Card" and
// "american express blue cash everyday" read the same.
export function normalizeCardName(value: string): string {
  let name = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  name = name.replace(/\bcashback\b/g, "cash back");
  for (const [pattern, replacement] of ALIASES) name = name.replace(pattern, replacement);
  return name.replace(/(\s|^)(credit )?card$/, "").replace(/\s+/g, " ").trim();
}

// The most catalog cards listed under the name field at once.
const MAX_MATCHES = 5;

// Catalog cards where every word typed starts a word of the name, in any
// order, from the second letter on: "disc cash" finds Discover it Student
// Cash Back, and "us" never matches inside "customized".
export function matchingCards(catalog: CatalogChoice[], typed: string): CatalogChoice[] {
  const words = normalizeCardName(typed).split(" ").filter(Boolean);
  if (words.join("").length < 2) return [];
  return catalog
    .filter((card) => {
      const name = normalizeCardName(card.name).split(" ");
      return words.every((word) => name.some((part) => part.startsWith(word)));
    })
    .slice(0, MAX_MATCHES);
}

// The catalog card a whole name stands for, or null: "chase freedom rise card"
// is Chase Freedom Rise; "Campus CU Visa" is none.
export function catalogCardNamed<T extends CatalogChoice>(catalog: T[], name: string): T | null {
  const typed = normalizeCardName(name);
  if (typed === "") return null;
  return catalog.find((card) => normalizeCardName(card.name) === typed) ?? null;
}
