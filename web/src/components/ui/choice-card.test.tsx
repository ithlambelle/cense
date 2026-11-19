// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChoiceCard, choiceCardClass, type ChoiceCardState } from "./choice-card";

const STATES: ChoiceCardState[] = ["default", "selected", "correct", "incorrect"];

function classes(element: HTMLElement): string[] {
  return element.className.split(/\s+/);
}

// The border width and padding, in px, read from the card's classes.
function geometry(element: HTMLElement) {
  const list = classes(element);
  const border = list.includes("border-2") ? 2 : list.includes("border") ? 1 : 0;
  const pad = (side: "l" | "r" | "y") => {
    const found = list.find((name) => name.startsWith(`p${side}-`));
    if (!found) return 0;
    const value = found.slice(3);
    return value.startsWith("[") ? Number.parseFloat(value.slice(1)) : Number.parseFloat(value) * 4;
  };
  return { border, left: pad("l"), right: pad("r"), vertical: pad("y") };
}

describe("ChoiceCard (Design System 371:3428)", () => {
  // State=Default, 371:3429: 1px border/brand outline, white, 56 tall, radius 16, nothing at the end.
  it("draws Default as a white card with a 1px Amethyst outline and no mark", () => {
    render(<ChoiceCard>Yes</ChoiceCard>);
    const card = screen.getByRole("button", { name: "Yes" });
    const list = classes(card);
    for (const name of ["border", "border-violet", "bg-white", "rounded-button", "min-h-14", "justify-between"]) {
      expect(list).toContain(name);
    }
    expect(list).not.toContain("border-2");
    expect(card.querySelector("img")).toBeNull();
    expect(card.textContent).toBe("Yes");
  });

  // The label, 371:3430: Inter Medium 16, line height normal, text/primary (#0f0b2e).
  it("sets the label in the body font, Medium 16, Indigo-black", () => {
    render(<ChoiceCard>Yes</ChoiceCard>);
    const list = classes(screen.getByRole("button", { name: "Yes" }));
    for (const name of ["text-body-m", "leading-[normal]", "font-medium", "text-indigo-black", "text-left"]) {
      expect(list).toContain(name);
    }
  });

  // State=Selected, 371:3431: 2px border/brand and the 20px Indicator with the plain green check.
  it("draws Selected with a 2px Amethyst outline and the check, no circle", () => {
    render(<ChoiceCard state="selected">Yes</ChoiceCard>);
    const card = screen.getByRole("button", { name: "Yes" });
    expect(classes(card)).toEqual(expect.arrayContaining(["border-2", "border-violet"]));
    const check = card.querySelector("img");
    expect(check?.getAttribute("src")).toContain("choice-check.svg");
    expect(check?.getAttribute("width")).toBe("20");
    expect(check?.getAttribute("height")).toBe("20");
    // Decorative: the state is in the caller's aria-pressed or aria-checked.
    expect(check?.getAttribute("alt")).toBe("");
    expect(card.querySelector("circle")).toBeNull();
  });

  // State=Correct, 371:3435: 2px status/doing-well (#61e294) and the same check.
  it("draws Correct with a 2px green outline and the check", () => {
    render(<ChoiceCard state="correct">True</ChoiceCard>);
    const card = screen.getByRole("button", { name: "True" });
    expect(classes(card)).toEqual(expect.arrayContaining(["border-2", "border-green"]));
    expect(card.querySelector("img")?.getAttribute("src")).toContain("choice-check.svg");
  });

  // State=Incorrect, 371:3439: 2px status/needs-attention (#ff6370) and "Not quite" in Regular 12, 70%.
  it("draws Incorrect with a 2px Coral outline and Not quite, no check", () => {
    render(<ChoiceCard state="incorrect">False</ChoiceCard>);
    const card = screen.getByRole("button", { name: "False Not quite" });
    expect(classes(card)).toEqual(expect.arrayContaining(["border-2", "border-coral"]));
    expect(card.querySelector("img")).toBeNull();
    const note = screen.getByText("Not quite");
    expect(classes(note)).toEqual(expect.arrayContaining(["text-caption", "font-normal", "text-indigo-black/70"]));
  });

  // Figma's strokes take no layout space, so the label sits 18px in and the
  // mark 16px in whatever the outline. A CSS border does take space: each
  // state's padding is 18 and 16 less its border, so picking never moves it.
  it("keeps the label 18px and the mark 16px from the edge in every state", () => {
    for (const state of STATES) {
      render(<ChoiceCard state={state}>{state}</ChoiceCard>);
      const { border, left, right, vertical } = geometry(screen.getByRole("button", { name: new RegExp(`^${state}`) }));
      expect({ state, left: border + left, right: border + right, vertical: border + vertical }).toEqual({
        state,
        left: 18,
        right: 16,
        vertical: 12,
      });
    }
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

  it("passes aria-pressed through for questions that toggle", () => {
    render(
      <ChoiceCard state="selected" aria-pressed>
        Groceries
      </ChoiceCard>,
    );
    expect(screen.getByRole("button", { name: "Groceries", pressed: true })).toBeTruthy();
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

  it("puts extra end content after the mark", () => {
    render(
      <ChoiceCard end={<span role="status">Saving</span>}>Not yet</ChoiceCard>,
    );
    expect(screen.getByRole("status").textContent).toBe("Saving");
  });
});

describe("choiceCardClass", () => {
  it("styles a link as a Default card, and a caller's class wins", () => {
    const list = choiceCardClass("default", "disabled:cursor-not-allowed").split(" ");
    expect(list).toEqual(expect.arrayContaining(["border", "border-violet", "rounded-button", "min-h-14"]));
    expect(list).toContain("disabled:cursor-not-allowed");
    expect(list).not.toContain("disabled:cursor-progress");
  });
});

// The check is the component's own asset (Indicator, 371:3433), unchanged.
describe("the check asset", () => {
  it("is the 20px Indicator with the Light Green check", () => {
    const svg = readFileSync(join(__dirname, "../../../public/icons/choice-check.svg"), "utf8");
    expect(svg).toContain('width="20" height="20" viewBox="0 0 20 20"');
    // --color-green in globals.css (status/doing-well in Figma).
    expect(svg).toContain('fill="#61E294"');
    expect(svg).not.toContain("<circle");
  });
});
