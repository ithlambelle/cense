// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CopyScript } from "./copy-script";

describe("CopyScript", () => {
  it("copies the steps as a numbered script and says so", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CopyScript steps={["Mention the denial.", "Ask for a second look."]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy script" }));
    expect((await screen.findByText("Copied.")).getAttribute("role")).toBe("status");
    expect(writeText).toHaveBeenCalledWith("1. Mention the denial.\n2. Ask for a second look.");
  });
});
