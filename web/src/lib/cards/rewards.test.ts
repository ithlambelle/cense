import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SPENDING_CATEGORIES } from "../quiz/spending";
import { listCards } from "./catalog";
import { CARD_REWARDS, cardRewards } from "./rewards";

const catalog = listCards();
const categoryIds = SPENDING_CATEGORIES.map((category) => category.id);
const allRates = Object.entries(CARD_REWARDS).flatMap(([id, rewards]) => rewards.rates.map((rate) => ({ id, rate })));

describe("CARD_REWARDS", () => {
  it("covers every card in the catalog, and only cards in the catalog", () => {
    expect(Object.keys(CARD_REWARDS).sort()).toEqual(catalog.map((card) => card.id).sort());
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

  it("maps rates only to quiz spending categories, with at most one base rate", () => {
    for (const { id, rate } of allRates) {
      if (rate.earnsOn === "all") continue;
      expect(new Set(rate.earnsOn).size, id).toBe(rate.earnsOn.length);
      for (const category of rate.earnsOn) expect(categoryIds, id).toContain(category);
    }
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      expect(rewards.rates.filter((rate) => rate.earnsOn === "all").length, id).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the base rate plain: no choice, rotation, cap or condition to meet", () => {
    for (const { id, rate } of allRates) {
      if (rate.earnsOn !== "all") continue;
      expect([rate.pickOne, rate.rotating, rate.requires, rate.cap], id).toEqual([false, false, null, null]);
    }
  });

  it("counts nothing for rotating categories, and offers a choice only among quiz categories", () => {
    for (const { id, rate } of allRates) {
      if (rate.rotating) expect(rate.earnsOn, id).toEqual([]);
      if (rate.pickOne) expect(Array.isArray(rate.earnsOn) && rate.earnsOn.length > 0, id).toBe(true);
      if (rate.requires !== null) expect(rate.requires.trim().length, id).toBeGreaterThan(0);
    }
  });

  it("keeps caps in whole positive cents, shared only with another rate on the card", () => {
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      for (const rate of rewards.rates) {
        if (!rate.cap) continue;
        expect(Number.isInteger(rate.cap.cents) && rate.cap.cents > 0, id).toBe(true);
        expect(["month", "quarter", "year"], id).toContain(rate.cap.per);
        if (rate.cap.sharedWith !== null) {
          const partner = rewards.rates.find((other) => other !== rate && other.category === rate.cap?.sharedWith);
          expect(partner?.cap, id).toEqual({ cents: rate.cap.cents, per: rate.cap.per, sharedWith: rate.category });
        }
      }
    }
  });

  it("sets a first-year rate no lower than the usual one", () => {
    for (const { id, rate } of allRates) {
      if (rate.yearOneAmount !== null) expect(rate.yearOneAmount, id).toBeGreaterThanOrEqual(rate.amount);
    }
  });

  it("values points only on points cards", () => {
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      if (rewards.pointValueCents === null) continue;
      expect(rewards.kind, id).toBe("points");
      expect(rewards.pointValueCents, id).toBeGreaterThan(0);
    }
  });

  it("points every image at a file in web/public", () => {
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      if (rewards.image === null) continue;
      expect(rewards.image, id).toBe(`/cards/${id}.png`);
      expect(existsSync(path.join(process.cwd(), "public", rewards.image)), id).toBe(true);
    }
  });

  it("looks a card up by id", () => {
    expect(cardRewards("citi-double-cash")?.rates.at(-1)?.earnsOn).toBe("all");
    expect(cardRewards("capital-one-savor-students")?.bonus?.valueCents).toBe(5_000);
    expect(cardRewards("not-a-card")).toBeNull();
  });
});
