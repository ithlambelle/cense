import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { listCards } from "./catalog";
import { CARD_REWARDS, cardRewards } from "./rewards";

const recommended = listCards().filter((card) => card.catalogRole === "recommend");

describe("CARD_REWARDS", () => {
  it("covers every recommended card, and only cards in the catalog", () => {
    expect(Object.keys(CARD_REWARDS).sort()).toEqual(recommended.map((card) => card.id).sort());
  });

  it("cites the issuer's page with the date it was read", () => {
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      expect(rewards.sourceUrl.startsWith("https://"), id).toBe(true);
      expect(rewards.verifiedAt, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("lists rates only for cards that earn rewards, highest first", () => {
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      if (rewards.kind === "none") {
        expect(rewards.rates, id).toEqual([]);
        continue;
      }
      expect(rewards.rates.length, id).toBeGreaterThan(0);
      const amounts = rewards.rates.map((rate) => rate.amount);
      expect(amounts, id).toEqual([...amounts].sort((a, b) => b - a));
      for (const rate of rewards.rates) {
        expect(rate.amount, id).toBeGreaterThan(0);
        expect(rate.unit, id).toBe(rewards.kind === "points" ? "points_per_dollar" : "percent");
      }
    }
  });

  it("keeps bonus amounts in whole cents", () => {
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      if (!rewards.bonus) continue;
      for (const cents of [rewards.bonus.valueCents, rewards.bonus.spendCents]) {
        if (cents !== null) expect(Number.isInteger(cents) && cents > 0, id).toBe(true);
      }
    }
  });

  it("points every image at a file in web/public", () => {
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      if (rewards.image === null) continue;
      expect(rewards.image, id).toBe(`/cards/${id}.png`);
      expect(existsSync(path.join(process.cwd(), "public", rewards.image)), id).toBe(true);
    }
  });

  it("has nothing yet for an explore card", () => {
    expect(cardRewards("citi-double-cash")).toBeNull();
    expect(cardRewards("capital-one-savor-students")?.bonus?.valueCents).toBe(5_000);
  });
});
