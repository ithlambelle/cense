import { describe, expect, it } from "vitest";

import { findCard, listCards } from "./catalog";
import { DEPOSIT_NOT_CALLED_REFUNDABLE, DEPOSIT_REFUNDS, depositLine } from "./deposit";

const withDeposit = listCards().filter((card) => card.secured && card.depositMinCents > 0);

describe("depositLine", () => {
  // A new secured card cannot slip through: its issuer's page has to be read
  // and the card put on one list or the other.
  it("has a decision for every secured card with a deposit, and only those", () => {
    const decided = [...Object.keys(DEPOSIT_REFUNDS), ...DEPOSIT_NOT_CALLED_REFUNDABLE].sort();
    expect(decided).toEqual(withDeposit.map((card) => card.id).sort());
  });

  it("calls the deposit refundable only where the issuer does, with when it comes back", () => {
    expect(depositLine(findCard("capital-one-platinum-secured")!)).toBe(
      "A refundable deposit backs the card. You get it back when you close the account and pay the balance in full, or when Capital One upgrades you to an unsecured card.",
    );
    for (const id of DEPOSIT_NOT_CALLED_REFUNDABLE) {
      const line = depositLine(findCard(id)!)!;
      expect(line, id).toMatch(/^A deposit backs the card\./);
      expect(line, id).not.toMatch(/refundable/i);
    }
  });

  // In the issuer's own terms: U.S. Bank says it may move you; Citi, only in good standing.
  it("keeps each issuer's conditions", () => {
    for (const id of ["us-bank-altitude-go-secured", "us-bank-cash-plus-secured"]) {
      expect(depositLine(findCard(id)!), id).toBe("A refundable deposit backs the card. U.S. Bank returns it if it moves you to the regular card.");
    }
    expect(depositLine(findCard("citi-secured")!)).toContain("in good standing");
  });

  it("says nothing for a card with no deposit", () => {
    expect(depositLine(findCard("chime-card")!)).toBeNull();
    expect(depositLine(findCard("discover-it-student-cash-back")!)).toBeNull();
  });

  it("cites the issuer's own page for every refundable deposit", () => {
    for (const [id, refund] of Object.entries(DEPOSIT_REFUNDS)) {
      const card = findCard(id)!;
      expect(refund.sourceUrl.startsWith("https://"), id).toBe(true);
      expect(card.applyUrl, id).toBe(refund.sourceUrl);
      expect(refund.verifiedAt, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
