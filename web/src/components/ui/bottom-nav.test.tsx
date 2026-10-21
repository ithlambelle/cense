// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomNav } from "./bottom-nav";

let pathname = "/results";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("BottomNav", () => {
  it("shows three labeled tabs, including the student's match", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: "My match" }).getAttribute("href")).toBe("/results");
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("href")).toBe("/cards");
  });

  it("marks only the current tab", () => {
    pathname = "/results";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "My match" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks Cards on a card page", () => {
    pathname = "/cards/discover-it-student-cash-back";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("aria-current")).toBe("page");
  });
});
