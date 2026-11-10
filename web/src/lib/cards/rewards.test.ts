import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SPENDING_CATEGORIES } from "../quiz/spending";
import { listCards } from "./catalog";
import { CARD_REWARDS, cardRewards } from "./rewards";

const catalog = listCards();
const categoryIds = SPENDING_CATEGORIES.map((category) => category.id);
const allRates = Object.entries(CARD_REWARDS).flatMap(([id, rewards]) => rewards.rates.map((rate) => ({ id, rate })));

// Every rate and bonus, with the words that could carry an end date.
const offers = Object.entries(CARD_REWARDS).flatMap(([id, rewards]) => [
  ...rewards.rates.map((rate) => ({ id, what: `${rate.amount} on ${rate.category}`, words: [rate.category, rate.condition], expiresOn: rate.expiresOn })),
  ...(rewards.bonus ? [{ id, what: "sign-up bonus", words: [rewards.bonus.summary], expiresOn: rewards.bonus.expiresOn }] : []),
]);

// A date as YYYY-MM-DD in the runner's own time zone.
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// The offers whose issuer-stated last day is before `today`.
function endedOffers(today: string): string[] {
  return offers.filter((offer) => offer.expiresOn != null && offer.expiresOn < today).map((offer) => `${offer.id}: ${offer.what} ended ${offer.expiresOn}`);
}

// Cards last read on their issuer's page more than `days` before `today`.
const STALE_AFTER_DAYS = 120;
function staleCards(today: Date, days: number): string[] {
  const cutoff = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
  return Object.entries(CARD_REWARDS)
    .filter(([, rewards]) => rewards.verifiedAt < cutoff)
    .map(([id, rewards]) => `${id} (read ${rewards.verifiedAt})`);
}

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

  it("ships no promotion past the last day its issuer states", () => {
    for (const offer of offers) {
      if (offer.expiresOn == null) continue;
      expect(offer.expiresOn, offer.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isoDay(new Date(`${offer.expiresOn}T12:00:00`)), offer.id).toBe(offer.expiresOn);
    }
    // Failing here means a limited-time rate or bonus has ended. Re-read the
    // issuer's page, then remove the offer or update it with its new terms,
    // end date and the card's verifiedAt.
    expect(endedOffers(isoDay(new Date()))).toEqual([]);
  });

  it("catches an ended promotion the day after its last day, not on it", () => {
    for (const offer of offers) {
      if (offer.expiresOn == null) continue;
      const last = new Date(`${offer.expiresOn}T12:00:00`);
      const line = `${offer.id}: ${offer.what} ended ${offer.expiresOn}`;
      expect(endedOffers(offer.expiresOn)).not.toContain(line);
      expect(endedOffers(isoDay(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)))).toContain(line);
    }
  });

  it("dates every offer whose wording names an end date", () => {
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    for (const offer of offers) {
      for (const words of offer.words) {
        if (!words) continue;
        const numeric = words.match(/\b(?:through|until|ends?|expires?|by)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i);
        const named = words.match(/\b(?:through|until|ends?|expires?|by)\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\b/i);
        const stated = numeric
          ? `${numeric[3]}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`
          : named && months.includes(named[1].toLowerCase())
            ? `${named[3]}-${String(months.indexOf(named[1].toLowerCase()) + 1).padStart(2, "0")}-${named[2].padStart(2, "0")}`
            : null;
        if (stated) expect(offer.expiresOn, `${offer.id}: ${offer.what}`).toBe(stated);
      }
    }
  });

  // A warning, not a failure: the weekly card data check (docs/card-data.md)
  // is what finds a changed page; this is the reminder to re-read the rest.
  it(`warns about cards not re-read on the issuer's page in ${STALE_AFTER_DAYS} days`, () => {
    const stale = staleCards(new Date(), STALE_AFTER_DAYS);
    if (stale.length > 0) {
      console.warn(
        `${stale.length} card(s) were last read on the issuer's page more than ${STALE_AFTER_DAYS} days ago. ` +
          `Re-read each page and its rewards terms, then update verifiedAt in web/src/lib/cards/rewards.ts:\n  ${stale.join("\n  ")}`,
      );
    }
    // The oldest read is fine on its 120th day and stale on the 121st.
    const oldest = Object.values(CARD_REWARDS).map((rewards) => rewards.verifiedAt).sort()[0];
    const read = new Date(`${oldest}T12:00:00`);
    const daysAfterRead = (days: number) => new Date(read.getFullYear(), read.getMonth(), read.getDate() + days);
    expect(staleCards(daysAfterRead(STALE_AFTER_DAYS), STALE_AFTER_DAYS)).toEqual([]);
    expect(staleCards(daysAfterRead(STALE_AFTER_DAYS + 1), STALE_AFTER_DAYS).length).toBeGreaterThan(0);
  });

  it("looks a card up by id", () => {
    expect(cardRewards("citi-double-cash")?.rates.at(-1)?.earnsOn).toBe("all");
    expect(cardRewards("capital-one-savor-students")?.bonus?.valueCents).toBe(5_000);
    expect(cardRewards("not-a-card")).toBeNull();
  });
});
