// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

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
});
