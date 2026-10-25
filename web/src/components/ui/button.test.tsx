// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("calls its handler when pressed", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Continue</Button>);
    const button = screen.getByRole("button", { name: "Continue" });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("blocks a second press and says it is busy while pending", () => {
    const onClick = vi.fn();
    render(<Button pending onClick={onClick}>Saving</Button>);
    const button = screen.getByRole("button", { name: "Saving" });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  // Primary action on the Design Edits frames (144:2030): label left, 14px chevron right.
  it("draws the primary with its label left and a chevron right", () => {
    render(<Button>Continue</Button>);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button.className).toContain("justify-between");
    expect(button.className).toContain("rounded-button");
    expect(button.className).toContain("text-button");
    const chevron = button.querySelector("svg");
    expect(chevron?.getAttribute("width")).toBe("14");
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
  });

  // Welcome (397:1505) and auth (397:1908) primaries have no chevron and a centered label.
  it("centers the label and drops the chevron when a frame draws none", () => {
    render(<Button chevron={false}>Log in</Button>);
    const button = screen.getByRole("button", { name: "Log in" });
    expect(button.className).toContain("justify-center");
    expect(button.querySelector("svg")).toBeNull();
  });

  it("keeps the chevron at the right while pending", () => {
    render(<Button pending>Saving</Button>);
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button.lastElementChild?.tagName.toLowerCase()).toBe("svg");
  });

  it("draws no chevron on the other variants", () => {
    render(
      <>
        <Button variant="secondary">Back to your plan</Button>
        <Button variant="outline">Compare side by side</Button>
        <Button variant="link">Log out</Button>
      </>,
    );
    for (const name of ["Back to your plan", "Compare side by side", "Log out"]) {
      expect(screen.getByRole("button", { name }).querySelector("svg")).toBeNull();
    }
  });

  // Secondary is Button/Secondary 79:9: Amethyst text, no fill or border, 44px.
  it("styles secondary as Amethyst text and outline as a bordered button", () => {
    const secondary = buttonVariants({ variant: "secondary" });
    expect(secondary).toContain("h-11");
    expect(secondary).toContain("text-violet");
    expect(secondary).not.toMatch(/\bbg-/);
    const outline = buttonVariants({ variant: "outline" });
    expect(outline).toContain("border-violet");
    expect(outline).toContain("text-navy");
    expect(buttonVariants({ variant: "link" })).toContain("underline");
  });
});
