import { describe, expect, it } from "vitest";

import { evaluateFit } from "../rules/fit-tier";
import { SECTION_7_CARDS, SECTION_7_STUDENTS } from "../rules/fit-tier.fixtures";
import { catalogReady, findCard, listCards } from "./catalog";

const recommended = () => listCards().filter((card) => card.catalogRole === "recommend");

describe("card catalog", () => {
  it("loads every reviewed card", () => {
    expect(catalogReady()).toBe(true);
    expect(listCards()).toHaveLength(53);
    expect(recommended()).toHaveLength(13);
  });

  it("has unique kebab-case IDs", () => {
    const ids = listCards().map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
  });

  it("finds a card by ID", () => {
    expect(findCard("chase-freedom-rise")?.name).toBe("Chase Freedom Rise");
    expect(findCard("not-a-card")).toBeUndefined();
  });

  it("lists only cards with no annual fee that are open to new applicants", () => {
    for (const card of listCards()) {
      expect(card.annualFeeCents).toBe(0);
      expect(card.openToNewApplicants).toBe(true);
    }
  });

  it("keeps every recommended deposit within the quiz's $200 question", () => {
    for (const card of recommended()) expect(card.depositMinCents).toBeLessThanOrEqual(20000);
  });

  it("gives every recommended card a history level the rules can use", () => {
    for (const card of recommended()) expect(["none", "limited", "established", "strong"]).toContain(card.historyNeeded);
  });

  it("matches the rules test data for the 13 recommended cards", () => {
    const fromCatalog = recommended().map((card) => ({
      id: card.id,
      catalogRole: card.catalogRole,
      annualFeeCents: card.annualFeeCents,
      hasPreapproval: card.preapprovalUrl !== null,
      historyNeeded: card.historyNeeded,
      studentsOnly: card.studentsOnly,
      secured: card.secured,
      depositMinCents: card.depositMinCents,
      depositMaxCents: card.depositMaxCents,
      okForRebuilding: card.okForRebuilding,
      runsCreditCheck: card.runsCreditCheck,
      openToNewApplicants: card.openToNewApplicants,
      conditions: card.conditions.map((condition) => condition.kind),
      historyBasis: card.eligibilityEvidence.historyNeeded.basis,
    }));
    const fromFixtures = SECTION_7_CARDS.map((card) => ({
      id: card.id,
      catalogRole: card.catalogRole,
      annualFeeCents: card.annualFeeCents,
      hasPreapproval: card.preapprovalUrl !== null,
      historyNeeded: card.historyNeeded,
      studentsOnly: card.studentsOnly,
      secured: card.secured,
      depositMinCents: card.depositMinCents,
      depositMaxCents: card.depositMaxCents,
      okForRebuilding: card.okForRebuilding,
      runsCreditCheck: card.runsCreditCheck,
      openToNewApplicants: card.openToNewApplicants,
      conditions: card.conditions.map((condition) => condition.kind),
      historyBasis: card.eligibilityEvidence.historyNeeded.basis,
    }));
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect(fromCatalog.sort(byId)).toEqual(fromFixtures.sort(byId));
  });

  it("gives the same results on the whole catalog as on the 13 recommended cards", () => {
    for (const student of SECTION_7_STUDENTS) {
      const full = evaluateFit(student.answers, listCards());
      const fixtures = evaluateFit(student.answers, SECTION_7_CARDS);
      if (full.status !== "complete" || fixtures.status !== "complete") throw new Error("incomplete");
      expect(full.recommendedCardId).toBe(fixtures.recommendedCardId);
      const tiers = (result: typeof full) => result.cards.map((fit) => [fit.cardId, fit.tier, ...fit.ruleIds].join(" ")).sort();
      expect(tiers(full)).toEqual(tiers(fixtures));
    }
  });
});
