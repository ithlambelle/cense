// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountView } from "./account-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("AccountView", () => {
  const CARD = {
    id: "00000000-0000-4000-8000-000000000001",
    cardId: null,
    cardName: "Sample Bank Card",
    status: "approved" as const,
    creditLimitCents: 50000,
    appliedAt: null,
    statusUpdatedAt: "2026-10-16T00:00:00Z",
  };
  const hrefs = (names: string[]) => names.map((name) => screen.getByRole("link", { name }).getAttribute("href"));

  it("shows the email, the tracked card with its limit, and the account links", () => {
    render(<AccountView email="student@example.edu" card={CARD} quizAnswered={6} quizResult="match" />);
    expect(screen.getByText("student@example.edu")).toBeTruthy();
    expect(screen.getByText("Approved, $500 limit")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Card quiz results" }).getAttribute("href")).toBe("/results");
    expect(screen.getByRole("link", { name: "Add a card I already have" }).getAttribute("href")).toBe("/home/add-card");
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("invites the student to start when no card is tracked, in Home's words, without repeating a row", () => {
    const { unmount } = render(<AccountView email={null} card={null} />);
    expect(screen.getByText("No card tracked yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start the quiz" }).getAttribute("href")).toBe("/quiz");
    // Adding a card is the Account row, once; the quiz is the box, once, and
    // never through Results, which has nothing to show yet.
    expect(screen.getAllByRole("link", { name: "Add a card I already have" })).toHaveLength(1);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).not.toContain("/results");
    unmount();
    render(<AccountView email={null} card={null} quizAnswered={2} />);
    expect(screen.getAllByRole("link", { name: "Continue the quiz" }).map((link) => link.getAttribute("href"))).toEqual(["/quiz"]);
  });

  it("leads to the result once the quiz is done, with a retake second, never Continue", () => {
    const { unmount } = render(<AccountView email={null} card={null} quizAnswered={6} quizResult="match" />);
    const box = () => screen.getByText("No card tracked yet.").parentElement!;
    expect([...box().querySelectorAll("a")].map((link) => link.textContent)).toEqual(["See your match", "Retake the quiz"]);
    expect(hrefs(["See your match", "Retake the quiz"])).toEqual(["/results", "/quiz"]);
    expect(screen.queryByRole("link", { name: "Continue the quiz" })).toBeNull();
    // The box leads to the result, so the row does not repeat it.
    expect(screen.queryByRole("link", { name: "Card quiz results" })).toBeNull();
    unmount();
    // No card fits: Home's words for that result.
    render(<AccountView email={null} card={null} quizAnswered={6} quizResult="no_card" />);
    expect([...box().querySelectorAll("a")].map((link) => link.textContent)).toEqual(["See why", "Retake the quiz"]);
    expect(hrefs(["See why"])).toEqual(["/results"]);
  });

  it("with a card tracked and no quiz result, the quiz row opens the quiz, not an empty result", () => {
    const { unmount } = render(<AccountView email={null} card={CARD} />);
    expect(screen.getByRole("link", { name: "Start the quiz" }).getAttribute("href")).toBe("/quiz");
    expect(screen.queryByRole("link", { name: "Card quiz results" })).toBeNull();
    unmount();
    render(<AccountView email={null} card={CARD} quizAnswered={3} />);
    expect(screen.getByRole("link", { name: "Continue the quiz" }).getAttribute("href")).toBe("/quiz");
  });
});
