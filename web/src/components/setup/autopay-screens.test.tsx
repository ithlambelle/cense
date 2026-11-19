// @vitest-environment jsdom
// Created with Claude Code (2026-11-19). I2 (the issuer's autopay steps) and
// I5 ("Autopay is on"): where Back and the next step go, from the setup list
// or from the card's own page.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutopayOn } from "./autopay-on";
import { AutopaySteps } from "./autopay-steps";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const ID = "00000000-0000-4000-8000-000000000001";
const CARD = "discover-it-student-cash-back";
const SETUP = `/applications/${ID}/setup`;

const on = (extra: Partial<Parameters<typeof AutopayOn>[0]> = {}) => (
  <AutopayOn applicationId={ID} cardName="Discover it Student Cash Back" issuerName="Discover" amount="Statement balance" nextPayment={null} {...extra} />
);

describe("I2, the issuer's autopay steps", () => {
  it("goes back to the setup list by default", () => {
    render(<AutopaySteps applicationId={ID} brand="Discover" issuer={null} />);
    expect(screen.getByRole("link", { name: "Back to Card setup" }).getAttribute("href")).toBe(SETUP);
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(`${SETUP}/autopay/confirm`);
  });

  it("opened from the card's page, goes back to it as it was opened and keeps that origin on the next screen", () => {
    render(<AutopaySteps applicationId={ID} brand="Discover" issuer={null} from="card" cardId={CARD} cardFrom="home" />);
    expect(screen.getByRole("link", { name: "Back to Card details" }).getAttribute("href")).toBe(`/cards/${CARD}?from=home`);
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(`${SETUP}/autopay/confirm?from=card&card_from=home`);
  });
});

describe("I5, Autopay is on", () => {
  it("goes back to the setup list by default, and its dates link returns there", () => {
    render(on());
    expect(screen.getByRole("link", { name: "Back to Card setup" }).getAttribute("href")).toBe(SETUP);
    expect(screen.getByRole("link", { name: "Add your dates" }).getAttribute("href")).toBe(`/applications/${ID}/reminders?from=setup`);
  });

  it("opened from the card's page, goes back to it, and so does its dates link's screen", () => {
    render(on({ from: "card", cardId: CARD, cardFrom: "results" }));
    expect(screen.getByRole("link", { name: "Back to Card details" }).getAttribute("href")).toBe(`/cards/${CARD}?from=results`);
    expect(screen.getByRole("link", { name: "Add your dates" }).getAttribute("href")).toBe(
      `/applications/${ID}/reminders?from=card&card_from=results`,
    );
  });
});
