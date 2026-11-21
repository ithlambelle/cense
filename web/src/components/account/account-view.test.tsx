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

  it("shows the tracked card's own art when it is from the catalog, else a plain card", () => {
    const { unmount } = render(
      <AccountView email="student@example.edu" card={{ ...CARD, cardId: "capital-one-quicksilver", cardName: "Capital One Quicksilver" }} quizAnswered={6} quizResult="match" />,
    );
    const row = screen.getByRole("link", { name: /Capital One Quicksilver/ });
    expect(decodeURIComponent(row.querySelector("img")?.getAttribute("src") ?? "")).toContain("/cards/capital-one-quicksilver.png");
    unmount();
    render(<AccountView email="student@example.edu" card={CARD} quizAnswered={6} quizResult="match" />);
    expect(screen.getByRole("link", { name: /Sample Bank Card/ }).querySelector('[data-testid="card-art-fallback"]')).not.toBeNull();
  });

  it("shows the email, the tracked card with its limit, the Account rows in the frame's order, and Log out with Switch account", () => {
    render(<AccountView email="student@example.edu" card={CARD} quizAnswered={6} quizResult="match" />);
    expect(screen.getByText("student@example.edu")).toBeTruthy();
    expect(screen.getByText("$500 limit")).toBeTruthy();
    const account = screen.getByRole("list", { name: "Account" });
    expect([...account.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Card quiz results", "/results"],
      ["Cards", "/cards?from=account"],
      ["Add a card I already have", "/home/add-card?from=account"],
      ["Reminder settings", "/settings/reminders"],
      ["Security and privacy", "/settings/privacy"],
    ]);
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch account" })).toBeTruthy();
    // No updates sent yet: the section is left out.
    expect(screen.queryByRole("heading", { name: "Updates" })).toBeNull();
  });

  it("shows Accounts (Figma E4), only once a bank is linked", () => {
    render(<AccountView email={null} card={CARD} bankLinked />);
    expect(screen.getByRole("link", { name: "Accounts" }).getAttribute("href")).toBe("/settings/accounts");
  });

  it("shows Updates with the new count, the latest one and See all, both to Updates", () => {
    const latest = { title: "Statement closes Nov 13", body: "Pay it down before then.", when: "Today" };
    const { unmount } = render(<AccountView email={null} card={CARD} updates={{ newCount: 2, latest }} />);
    expect(screen.getByRole("heading", { name: "Updates" })).toBeTruthy();
    expect(screen.getByText("2 new")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^See all/ }).getAttribute("href")).toBe("/updates");
    expect(screen.getByRole("link", { name: /Statement closes Nov 13/ }).getAttribute("href")).toBe("/updates");
    unmount();
    render(<AccountView email={null} card={CARD} updates={{ newCount: 0, latest }} />);
    expect(screen.queryByText(/new$/)).toBeNull();
  });

  it("invites the student to start when no card is tracked, in Home's words, without repeating a row", () => {
    const { unmount } = render(<AccountView email={null} card={null} />);
    expect(screen.getByText("No card tracked yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start the quiz" }).getAttribute("href")).toBe("/quiz?from=account");
    // Adding a card is the Account row, once; the quiz is the box, once, and
    // never through Results, which has nothing to show yet.
    expect(screen.getAllByRole("link", { name: "Add a card I already have" })).toHaveLength(1);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).not.toContain("/results");
    unmount();
    render(<AccountView email={null} card={null} quizAnswered={2} />);
    expect(screen.getAllByRole("link", { name: "Continue the quiz" }).map((link) => link.getAttribute("href"))).toEqual(["/quiz?from=account"]);
  });

  it("leads to the result once the quiz is done, with a retake second, never Continue", () => {
    const { unmount } = render(<AccountView email={null} card={null} quizAnswered={6} quizResult="match" />);
    const box = () => screen.getByText("No card tracked yet.").parentElement!;
    expect([...box().querySelectorAll("a")].map((link) => link.textContent)).toEqual(["See your match", "Retake the quiz"]);
    expect(hrefs(["See your match", "Retake the quiz"])).toEqual(["/results", "/quiz?from=account"]);
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
    expect(screen.getByRole("link", { name: "Start the quiz" }).getAttribute("href")).toBe("/quiz?from=account");
    expect(screen.queryByRole("link", { name: "Card quiz results" })).toBeNull();
    unmount();
    render(<AccountView email={null} card={CARD} quizAnswered={3} />);
    expect(screen.getByRole("link", { name: "Continue the quiz" }).getAttribute("href")).toBe("/quiz?from=account");
  });
});
