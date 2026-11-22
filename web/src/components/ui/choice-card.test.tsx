// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { legacyCard } from "@/components/legacy/answer-card";

import { ChoiceCard as SwitchedChoiceCard, choiceCardClass, type ChoiceCardState } from "./choice-card";

// Pinned to the main look, so flipping UI_VERSION for a rollback does not turn
// these red; the archived card has its own tests below.
function ChoiceCard(props: ComponentProps<typeof SwitchedChoiceCard>) {
  return <SwitchedChoiceCard look="borderless" {...props} />;
}

const STATES: ChoiceCardState[] = ["default", "selected", "correct", "incorrect", "reveal"];

function classes(element: Element): string[] {
  return element.className.split(/\s+/);
}

describe("ChoiceCard (Design System, Choice card · borderless 765:2498)", () => {
  // State=Default, 765:2476: Off-white fill, no border, Inter Regular 16 text/primary.
  it("draws Default as an Off-white card with no border and no indicator", () => {
    render(<ChoiceCard>Yes</ChoiceCard>);
    const card = screen.getByRole("button", { name: "Yes" });
    const list = classes(card);
    for (const name of ["bg-off-white", "font-normal", "text-indigo-black", "rounded-button", "min-h-14", "text-body-m", "text-left"]) {
      expect(list).toContain(name);
    }
    expect(list.some((name) => /^border(-|$)/.test(name))).toBe(false);
    expect(card.querySelector("img")).toBeNull();
    expect(card.textContent).toBe("Yes");
  });

  // State=Selected, 765:2478: brand violet with a white Inter Medium label, and no check.
  it("draws Selected as solid Violet with a white Medium label and no check", () => {
    render(
      <ChoiceCard state="selected" aria-pressed>
        Yes
      </ChoiceCard>,
    );
    const card = screen.getByRole("button", { name: "Yes", pressed: true });
    expect(classes(card)).toEqual(expect.arrayContaining(["bg-violet", "font-medium", "text-white"]));
    expect(card.querySelector("img")).toBeNull();
  });

  // Correct 765:2480, Incorrect 765:2486, Answer reveal 765:2492: a fill, words and the frame's icon.
  it.each([
    ["correct", "bg-green", "Correct", "choice-correct.svg"],
    ["incorrect", "bg-coral", "Not quite", "choice-incorrect.svg"],
    ["reveal", "bg-off-white", "Right answer", "choice-reveal.svg"],
  ] as const)("draws %s with its fill, its words and its icon", (state, fill, words, icon) => {
    render(<ChoiceCard state={state}>True</ChoiceCard>);
    // The words are part of the answer's name, so the state never rests on color alone.
    const card = screen.getByRole("button", { name: `True ${words}` });
    expect(classes(card)).toEqual(expect.arrayContaining([fill, "font-medium", "text-indigo-black"]));
    const indicator = screen.getByText(words);
    expect(classes(indicator)).toEqual(expect.arrayContaining(["text-[13px]", "font-medium", "gap-1.5"]));
    const image = card.querySelector("img");
    expect(image?.getAttribute("src")).toContain(icon);
    expect(image?.getAttribute("width")).toBe("20");
    expect(image?.getAttribute("alt")).toBe("");
  });

  // No border in any state, so the padding never changes and picking never moves the label.
  it("keeps the label 18px and the indicator 16px from the edge in every state", () => {
    for (const state of STATES) {
      const { unmount } = render(<ChoiceCard state={state}>{state}</ChoiceCard>);
      const list = classes(screen.getByRole("button", { name: new RegExp(`^${state}`) }));
      expect(list).toEqual(expect.arrayContaining(["pl-[18px]", "pr-4", "py-3"]));
      unmount();
    }
  });

  it("looks the same on a multi-select question", () => {
    render(
      <ChoiceCard multiple aria-pressed={false}>
        Groceries
      </ChoiceCard>,
    );
    expect(screen.getByRole("button", { name: "Groceries" }).querySelector("img, svg")).toBeNull();
  });

  it("passes the caller's radio semantics through", () => {
    render(
      <div role="radiogroup" aria-label="Pick one">
        <ChoiceCard role="radio" state="selected" aria-checked>
          One
        </ChoiceCard>
        <ChoiceCard role="radio" aria-checked={false}>
          Two
        </ChoiceCard>
      </div>,
    );
    expect(screen.getByRole("radio", { name: "One" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Two" }).getAttribute("aria-checked")).toBe("false");
  });

  // Spend limit's cards sit inside its form: a tap picks, it must not submit.
  it("is a plain button, so a tap inside a form never submits it", () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const onClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <ChoiceCard onClick={onClick}>$150 a month</ChoiceCard>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "$150 a month" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const onClick = vi.fn();
    render(
      <ChoiceCard disabled onClick={onClick}>
        Yes
      </ChoiceCard>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a keyboard focus ring", () => {
    render(<ChoiceCard>Yes</ChoiceCard>);
    expect(classes(screen.getByRole("button", { name: "Yes" }))).toEqual(
      expect.arrayContaining(["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-ring"]),
    );
  });

  it("puts extra end content after the indicator", () => {
    render(<ChoiceCard end={<span role="status">Saving</span>}>Not yet</ChoiceCard>);
    expect(screen.getByRole("status").textContent).toBe("Saving");
  });
});

describe("choiceCardClass", () => {
  it("styles a link as a Default card, and a caller's class wins", () => {
    const list = choiceCardClass("default", "disabled:cursor-not-allowed").split(" ");
    expect(list).toEqual(expect.arrayContaining(["bg-off-white", "rounded-button", "min-h-14"]));
    expect(list).toContain("disabled:cursor-not-allowed");
    expect(list).not.toContain("disabled:cursor-progress");
  });
});

// The archived card (components/legacy/) stays drawable, so a rollback is one word in ui-version.ts.
describe("the archived card (UI_VERSION.choiceCard = legacy)", () => {
  it("draws the white outlined card with the green-circle check when chosen", () => {
    render(
      <SwitchedChoiceCard look="legacy" state="selected" aria-pressed>
        Yes
      </SwitchedChoiceCard>,
    );
    const card = screen.getByRole("button", { name: "Yes", pressed: true });
    expect(classes(card)).toEqual(expect.arrayContaining(["border-[1.5px]", "border-violet", "bg-white", "rounded-[18px]"]));
    expect(card.querySelector("svg circle")).not.toBeNull();
  });

  it("draws the empty ring on an unpicked multi-select answer, and nothing on pick-one", () => {
    render(
      <>
        <SwitchedChoiceCard look="legacy" multiple>
          Groceries
        </SwitchedChoiceCard>
        <SwitchedChoiceCard look="legacy">No</SwitchedChoiceCard>
      </>,
    );
    expect(screen.getByRole("button", { name: "Groceries" }).querySelector("img")?.getAttribute("src")).toContain("selection-ring.svg");
    expect(screen.getByRole("button", { name: "No" }).querySelector("img, svg")).toBeNull();
  });

  // Each screen gets back its own card from main, not an average of them.
  it.each([
    ["two-answer quiz question", legacyCard.quiz(false), ["min-h-20", "rounded-card", "border-[1.5px]", "px-[18px]"]],
    ["longer quiz question", legacyCard.quiz(true), ["min-h-14", "rounded-[18px]", "px-[18px]"]],
    ["spending question", legacyCard.spending, ["min-h-14", "rounded-[18px]", "px-5"]],
    ["reminder timing", legacyCard.reminder, ["min-h-20", "rounded-card", "px-5"]],
    ["autopay", legacyCard.autopay, ["h-14", "rounded-button", "border", "font-medium", "text-indigo-black"]],
    ["picked spend limit", legacyCard.spendLimit(true), ["h-14", "border-2", "font-medium"]],
    ["unpicked spend limit", legacyCard.spendLimit(false), ["h-14", "border", "font-medium"]],
    ["picked snooze", legacyCard.snooze(true), ["border-2", "font-medium", "text-indigo-black", "px-5"]],
    ["denial row", legacyCard.denial, ["rounded-[18px]", "px-5", "justify-between", "gap-4"]],
    ["Ask Penny suggestion", legacyCard.penny, ["rounded-[18px]", "px-5", "text-left"]],
  ])("keeps the %s as it was", (_name, className, expected) => {
    render(
      <SwitchedChoiceCard look="legacy" legacyClassName={className}>
        Answer
      </SwitchedChoiceCard>,
    );
    expect(classes(screen.getByRole("button", { name: "Answer" }))).toEqual(expect.arrayContaining(expected));
  });

  it("styles a link as the archived outlined row", () => {
    expect(choiceCardClass("default", undefined, "legacy").split(" ")).toEqual(
      expect.arrayContaining(["border-[1.5px]", "border-violet", "rounded-[18px]"]),
    );
  });
});

// The icons are the component's own assets (Indicator 765:2482, 765:2488, 765:2494), unchanged.
describe("the indicator icons", () => {
  it.each([
    ["choice-correct.svg", "#0F0B2E", "#61E294"],
    ["choice-incorrect.svg", "#0F0B2E", "#FF6370"],
    ["choice-reveal.svg", "#61E294", "#0F0B2E"],
  ])("%s is the 20px circle and mark from the frame", (file, circle, mark) => {
    const svg = readFileSync(join(__dirname, "../../../public/icons", file), "utf8");
    expect(svg).toContain('width="20" height="20" viewBox="0 0 20 20"');
    expect(svg).toContain(`rx="10" fill="${circle}"`);
    expect(svg).toContain(`fill="${mark}"`);
  });
});
