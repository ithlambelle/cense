// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomNav } from "./bottom-nav";

let pathname = "/home";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

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
  it("shows two labeled tabs, Home and Cards, until Learn has something to do", () => {
    render(<BottomNav />);
    expect(nav()).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("href")).toBe("/cards");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("marks only the current tab", () => {
    pathname = "/home";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks Cards on a card page", () => {
    pathname = "/cards/discover-it-student-cash-back";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("aria-current")).toBe("page");
  });

  it("hides while a text field has focus and comes back when it loses focus", () => {
    render(<BottomNav />);
    const field = addField('<input type="text" />');
    act(() => field.focus());
    expect(nav().hidden).toBe(true);
    act(() => field.blur());
    expect(nav().hidden).toBe(false);
  });

  it("stays hidden when focus moves from one field to the next", () => {
    render(<BottomNav />);
    const first = addField('<input type="email" />');
    const second = addField("<textarea></textarea>");
    act(() => first.focus());
    act(() => second.focus());
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
