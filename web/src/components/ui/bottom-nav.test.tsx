// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomNav } from "./bottom-nav";

let pathname = "/home";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("BottomNav", () => {
  it("shows three labeled tabs: Home, Cards and Learn", () => {
    render(<BottomNav />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("href")).toBe("/cards");
    expect(screen.getByRole("link", { name: "Learn" }).getAttribute("href")).toBe("/learn");
    expect(screen.queryByRole("link", { name: "My match" })).toBeNull();
  });

  it("marks only the current tab", () => {
    pathname = "/learn";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Learn" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks Cards on a card page", () => {
    pathname = "/cards/discover-it-student-cash-back";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("aria-current")).toBe("page");
  });
});
