// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LearnView } from "./learn-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/learn" }));

describe("LearnView", () => {
  it("shows Penny, the course and topics, marks Learn in the bar, and links nothing that is not built", () => {
    render(<LearnView />);
    expect(screen.getByRole("heading", { name: "Learn" })).toBeTruthy();
    expect(screen.getByText("Ask Penny opens soon.")).toBeTruthy();
    expect(screen.getByText("0 of 5 done")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Learn" }).getAttribute("aria-current")).toBe("page");
    // Only the bottom bar's three tabs are links.
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
