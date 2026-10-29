// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PennyComposer } from "@/components/learn/penny-composer";

import { PENNY_TOPICS } from "./answers";
import { PENNY_COPY, PENNY_SCOPE } from "./copy";

// One description of what Penny can answer, so the screens cannot disagree
// (QA comprehension reading of #71: "anything", "cards or credit", "cards
// and credit" and the full list appeared on different screens).
describe("Penny's scope", () => {
  it("names the four topics her checked answers cover", () => {
    expect(PENNY_SCOPE).toBe("credit, budgeting, saving and student loans");
    for (const topic of PENNY_TOPICS) expect(PENNY_SCOPE).toContain(topic.label.toLowerCase());
  });

  it("is how the greeting, the advice reply and the off-topic reply say what Penny knows", () => {
    for (const line of [PENNY_COPY.greeting, PENNY_COPY.advice, PENNY_COPY.offTopic]) expect(line).toContain(PENNY_SCOPE);
  });

  it("is never stated another way", () => {
    for (const line of Object.values(PENNY_COPY)) expect(line).not.toMatch(/anything|cards (or|and) credit/i);
  });

  it.each(["learn", "chat"] as const)("leaves the %s field's placeholder to the shared line", (variant) => {
    render(<PennyComposer variant={variant} onAsk={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Ask Penny" }).getAttribute("placeholder")).toBe(PENNY_COPY.placeholder);
  });
});
