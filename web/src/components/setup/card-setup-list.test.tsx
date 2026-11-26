// @vitest-environment jsdom
// Created with Claude Code (2026-11-26). I1, the card setup list: its steps'
// heading, the link to the card's own page, and the spend limit row.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CardSetupList } from "./card-setup-list";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const ID = "00000000-0000-4000-8000-000000000001";
const NONE = { dates: false, autopay: false, spendLimit: false, reminders: false };

describe("CardSetupList", () => {
  it("heads its steps without a count, and links a catalog card to its page", () => {
    render(<CardSetupList applicationId={ID} cardName="Discover it Student Cash Back" brand="Discover" cardId="discover-it-student-cash-back" creditLimitCents={100000} progress={NONE} />);
    expect(screen.getByRole("heading", { level: 2, name: "Your steps" })).toBeTruthy();
    expect(screen.queryByText("Three steps")).toBeNull();
    expect(screen.queryByText("Your first month")).toBeNull();
    expect(screen.getByRole("link", { name: "Card details" }).getAttribute("href")).toBe("/cards/discover-it-student-cash-back");
  });

  it("has no card page link for a card added from outside the catalog", () => {
    render(<CardSetupList applicationId={ID} cardName="Credit Union Card" brand={null} creditLimitCents={null} progress={NONE} />);
    expect(screen.queryByRole("link", { name: "Card details" })).toBeNull();
  });

  it("reopens a saved limit of the student's own on Pick your limit", () => {
    render(<CardSetupList applicationId={ID} cardName="Card" brand={null} creditLimitCents={100000} spendLimitCents={10000} progress={{ ...NONE, spendLimit: true }} />);
    expect(screen.getByRole("link", { name: /^Set a spend limit/ }).getAttribute("href")).toBe(`/applications/${ID}/setup/spend-limit/pick`);
  });
});
