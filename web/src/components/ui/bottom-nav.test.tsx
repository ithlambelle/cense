// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BottomNav } from "./bottom-nav";

let pathname = "/home";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

beforeEach(() => {
  pathname = "/home";
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

// By selector: a hidden element has no accessible name, so a role query misses it.
function nav(): HTMLElement {
  const element = document.querySelector<HTMLElement>('nav[aria-label="Main"]');
  if (!element) throw new Error("Main navigation not rendered");
  return element;
}

function addField(markup: string): HTMLElement {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  document.body.appendChild(holder);
  return holder.firstElementChild as HTMLElement;
}

describe("BottomNav", () => {
  it("shows three labeled tabs: Home, Cards and Learn", () => {
    render(<BottomNav />);
    expect(nav()).toBeTruthy();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Home", "Cards", "Learn"]);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("href")).toBe("/cards");
    expect(screen.getByRole("link", { name: "Learn" }).getAttribute("href")).toBe("/learn");
  });

  it("marks Learn on a topic page and in Ask Penny", () => {
    for (const path of ["/learn", "/learn/credit", "/learn/penny"]) {
      pathname = path;
      render(<BottomNav />);
      expect(screen.getByRole("link", { name: "Learn" }).getAttribute("aria-current"), path).toBe("page");
      cleanup();
    }
  });

  it("marks only the current tab", () => {
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks Cards on a card page", () => {
    pathname = "/cards/discover-it-student-cash-back";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("aria-current")).toBe("page");
  });

  it("hides while a text field has focus and comes back when it loses focus", async () => {
    render(<BottomNav />);
    const field = addField('<input type="text" />');
    act(() => field.focus());
    expect(nav().hidden).toBe(true);
    await act(async () => {
      field.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(nav().hidden).toBe(false);
  });

  it("starts hidden when a field already has focus", () => {
    const field = addField('<input type="email" />');
    field.focus();
    render(<BottomNav />);
    expect(nav().hidden).toBe(true);
  });

  it("stays visible for a read-only field, which opens no keyboard", () => {
    render(<BottomNav />);
    const field = addField('<input type="text" readonly />');
    act(() => field.focus());
    expect(nav().hidden).toBe(false);
  });

  it("stays hidden when focus moves from one field to the next", async () => {
    render(<BottomNav />);
    const first = addField('<input type="email" />');
    const second = addField("<textarea></textarea>");
    act(() => first.focus());
    await act(async () => {
      second.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(nav().hidden).toBe(true);
  });

  it("stays visible when a button or a radio has focus", () => {
    render(<BottomNav />);
    const button = addField("<button>Save</button>");
    const radio = addField('<input type="radio" />');
    act(() => button.focus());
    expect(nav().hidden).toBe(false);
    act(() => radio.focus());
    expect(nav().hidden).toBe(false);
  });
});
