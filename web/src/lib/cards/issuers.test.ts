// Created with Claude Code (2026-11-08).
import { describe, expect, it } from "vitest";

import { listCards } from "./catalog";
import { ISSUERS, issuerForBrand } from "./issuers";

// The issuers' own domains, the only places a link may go (I4).
const DOMAINS: Record<string, string> = {
  "Capital One": "capitalone.com",
  Discover: "discover.com",
  "Bank of America": "bankofamerica.com",
  Chase: "chase.com",
  Chime: "chime.com",
};

describe("issuer link-out data", () => {
  it("covers every recommended card's brand", () => {
    for (const card of listCards().filter((each) => each.catalogRole === "recommend")) {
      expect(issuerForBrand(card.brand), card.id).not.toBeNull();
    }
  });

  it("links only to the issuer's own site and store listings, over https", () => {
    for (const [brand, issuer] of Object.entries(ISSUERS)) {
      expect(new URL(issuer.site.url).hostname).toBe(`www.${DOMAINS[brand]}`);
      expect(issuer.site.label).toBe(DOMAINS[brand]);
      expect(issuer.appStoreUrl).toMatch(/^https:\/\/apps\.apple\.com\/us\/app\/[a-z0-9-]+\/id\d+$/);
      expect(issuer.playStoreUrl).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=[a-z0-9.]+$/);
      if (issuer.source) {
        expect(new URL(issuer.source.url).hostname.endsWith(DOMAINS[brand])).toBe(true);
        expect(issuer.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("keeps three short steps in plain copy", () => {
    for (const issuer of Object.values(ISSUERS)) {
      expect(issuer.steps).toHaveLength(3);
      expect(issuer.steps[0].title).toBe(`Open ${issuer.name}`);
      for (const step of issuer.steps) {
        expect(`${step.title} ${step.detail}`).not.toMatch(/[—~]/);
        expect(step.detail.length).toBeLessThanOrEqual(90);
      }
    }
  });

  it("words Chime's steps for a card paid from the Chime account", () => {
    expect(ISSUERS.Chime.steps[2].detail).toContain("Chime account");
  });

  it("has nothing for a brand without steps, or no brand", () => {
    expect(issuerForBrand("Citi")).toBeNull();
    expect(issuerForBrand(null)).toBeNull();
    expect(issuerForBrand("toString")).toBeNull();
  });
});
