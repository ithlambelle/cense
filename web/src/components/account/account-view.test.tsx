// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountView } from "./account-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("AccountView", () => {
  it("shows the email, the tracked card with its limit, and the account links", () => {
    render(
      <AccountView
        email="student@example.edu"
        card={{
          id: "00000000-0000-4000-8000-000000000001",
          cardId: null,
          cardName: "Sample Bank Card",
          status: "approved",
          creditLimitCents: 50000,
          appliedAt: null,
          statusUpdatedAt: "2026-10-16T00:00:00Z",
        }}
      />,
    );
    expect(screen.getByText("student@example.edu")).toBeTruthy();
    expect(screen.getByText("Approved, $500 limit")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Card quiz results" }).getAttribute("href")).toBe("/results");
    expect(screen.getByRole("link", { name: "Add a card I already have" }).getAttribute("href")).toBe("/home/add-card");
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("invites the student to start when no card is tracked", () => {
    render(<AccountView email={null} card={null} />);
    expect(screen.getByText(/No card tracked yet/)).toBeTruthy();
  });
});
