// The look of each issuer's badge on the card list and card pages: a short
// mark in the brand's main color. Stand-ins until the team has logo files
// cleared for use; the badge is decorative, the issuer's name is always
// written next to it.
export type IssuerStyle = { mark: string; background: string; color: string };

const ISSUERS: Record<string, IssuerStyle> = {
  "American Express": { mark: "AMEX", background: "#006fcf", color: "#ffffff" },
  Apple: { mark: "A", background: "#1d1d1f", color: "#ffffff" },
  "Bank of America": { mark: "BofA", background: "#012169", color: "#ffffff" },
  "Capital One": { mark: "C1", background: "#004977", color: "#ffffff" },
  Chase: { mark: "CH", background: "#117aca", color: "#ffffff" },
  Chime: { mark: "C", background: "#1ec677", color: "#0a1045" },
  Citi: { mark: "citi", background: "#056dae", color: "#ffffff" },
  Discover: { mark: "D", background: "#ff6000", color: "#ffffff" },
  "U.S. Bank": { mark: "USB", background: "#0c2074", color: "#ffffff" },
  "Wells Fargo": { mark: "WF", background: "#d71e28", color: "#ffcd41" },
};

// A brand added to the catalog before it has an entry here still gets a
// badge: its initials on navy.
export function issuerStyle(brand: string): IssuerStyle {
  const known = ISSUERS[brand];
  if (known) return known;
  const initials = brand
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, "")[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return { mark: initials || "?", background: "#0a1045", color: "#ffffff" };
}

// Cards grouped by issuer, the issuers in alphabetical order. Within an
// issuer, cards the rules can recommend come first; the catalog's own order
// is kept otherwise.
export function groupByIssuer<T extends { brand: string; catalogRole: string }>(
  cards: T[],
): { brand: string; cards: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const card of cards) {
    const group = groups.get(card.brand);
    if (group) group.push(card);
    else groups.set(card.brand, [card]);
  }
  const rank = (card: T) => (card.catalogRole === "recommend" ? 0 : 1);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([brand, group]) => ({ brand, cards: [...group].sort((a, b) => rank(a) - rank(b)) }));
}
