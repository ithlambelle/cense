// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FindingCards } from "./finding-cards";

describe("FindingCards", () => {
  it("announces the wait politely and offers a still image for reduced motion", () => {
    const { container } = render(<FindingCards />);
    expect(screen.getByRole("status").textContent).toContain("Finding the right cards for you");
    expect(screen.getByRole("heading", { name: "Hold tight!" })).toBeTruthy();
    const source = container.querySelector("source");
    expect(source?.getAttribute("media")).toBe("(prefers-reduced-motion: reduce)");
    expect(source?.getAttribute("srcset")).toBe("/mascot/penny-loading-still.png");
  });
});
