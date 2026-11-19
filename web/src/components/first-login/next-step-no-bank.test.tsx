// @vitest-environment jsdom
// Created with Claude Code (2026-11-19). N3, Your next step without a bank:
// one question, and each answer opens its next step.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { choiceRowClass } from "@/components/ui/choice-row";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import { NextStepNoBank } from "./next-step-no-bank";

describe("NextStepNoBank", () => {
  it("asks the frame's question in its words", () => {
    const { container } = render(<NextStepNoBank backHref="/start/link-bank" backLabel="Link your bank" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Do you have a credit card yet?");
    expect(screen.getByText("Your next step").className).toContain("uppercase");
    // Home's "See what's safe to spend" card is where a student with no bank
    // links one; Profile shows Accounts only once a bank is linked.
    expect(screen.getByText("So we know where to start. You can link your bank later from Home.")).toBeTruthy();
    expect(container.textContent).not.toContain("Profile");
    expect(container.textContent).not.toMatch(/—|~/);
  });

  it("leaves out the link-later line where safe to spend is off", () => {
    render(<NextStepNoBank backHref="/home" backLabel="Home" canLinkLater={false} />);
    expect(screen.getByText("So we know where to start.")).toBeTruthy();
    expect(screen.queryByText(/link your bank later/)).toBeNull();
  });

  it("opens the card quiz for Not yet and Add a card for Yes, as the shared answer card", () => {
    render(<NextStepNoBank backHref="/start/link-bank" backLabel="Link your bank" />);
    const answers = within(screen.getByRole("list", { name: "Do you have a credit card yet?" })).getAllByRole("link");
    expect(answers.map((answer) => [answer.textContent, answer.getAttribute("href")])).toEqual([
      ["Not yet", "/quiz?from=start"],
      ["Yes, I have one", "/home/add-card"],
    ]);
    for (const answer of answers) expect(answer.className).toBe(choiceRowClass);
    // Whether a student has a card is theirs: masked like the quiz's answers.
    expect(screen.getByRole("list").className).toContain("ph-sensitive");
  });

  it("has the one back arrow, to the screen it was opened from", () => {
    render(<NextStepNoBank backHref="/start/link-bank" backLabel="Link your bank" />);
    const back = screen.getByRole("link", { name: "Back to Link your bank" });
    expect(back.getAttribute("href")).toBe("/start/link-bank");
  });
});
