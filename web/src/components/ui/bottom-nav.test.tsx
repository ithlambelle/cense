// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { BottomNav as SwitchedBottomNav } from "./bottom-nav";

let pathname = "/home";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

beforeEach(() => {
  pathname = "/home";
});

// Pinned to the main look, so flipping UI_VERSION for a rollback does not turn
// these red; the archived bar passes look="legacy".
function BottomNav(props: ComponentProps<typeof SwitchedBottomNav>) {
  return <SwitchedBottomNav look="five-tab" {...props} />;
}

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

  // Bottom nav · 5 tabs (770:1029): icons only, as drawn, each with a name a
  // screen reader says.
  it("shows five tabs, Home, Cards, Penny, Calendar and Profile, each named", () => {
    render(<BottomNav />);
    expect(nav()).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["Home", "Cards", "Penny", "Calendar", "Profile"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/home", "/cards", "/learn", "/calendar", "/settings"]);
    // No visible labels: the words are only for screen readers.
    expect(links.every((link) => link.textContent === "")).toBe(true);
  });

  it("is fixed to the bottom of the screen, with a placeholder holding its height (G2)", () => {
    const { container } = render(<BottomNav />);
    expect(nav().className).toContain("fixed");
    expect(nav().className).toContain("bottom-0");
    expect(nav().className).not.toContain("sticky");
    expect(container.querySelector('[data-slot="bottom-nav-space"]')?.className).toBe(
      "box-content h-[53px] pt-3 pb-[max(1.5625rem,env(safe-area-inset-bottom))]",
    );
    // The frame's 13px side padding.
    expect(nav().querySelector("ul")?.className).toContain("px-[13px]");
  });

  it("draws the current tab's icon in Light Blue and the rest at 70% white", () => {
    pathname = "/calendar";
    render(<BottomNav />);
    const icon = (name: string) => screen.getByRole("link", { name }).querySelector("img")?.getAttribute("src");
    expect(icon("Calendar")).toContain("calendar-active.svg");
    expect(icon("Home")).toContain("home-inactive.svg");
    expect(icon("Profile")).toContain("profile-inactive.svg");
  });

  it("marks Penny on Learn, a topic page and Ask Penny, with the winking Penny", () => {
    for (const path of ["/learn", "/learn/credit", "/learn/penny"]) {
      pathname = path;
      render(<BottomNav />);
      const penny = screen.getByRole("link", { name: "Penny" });
      expect(penny.getAttribute("aria-current"), path).toBe("page");
      expect(penny.querySelector("img")?.getAttribute("src")).toContain("penny-wink.png");
      cleanup();
    }
    pathname = "/home";
    render(<BottomNav />);
    const srcs = [...screen.getByRole("link", { name: "Penny" }).querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs.join(" ")).toContain("penny-star.png");
    expect(srcs.join(" ")).not.toContain("penny-wink.png");
  });

  it("marks Profile on Your account and its pages", () => {
    for (const path of ["/settings", "/settings/reminders", "/settings/privacy"]) {
      pathname = path;
      render(<BottomNav />);
      expect(screen.getByRole("link", { name: "Profile" }).getAttribute("aria-current"), path).toBe("page");
      cleanup();
    }
  });

  it("marks only the current tab", () => {
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    for (const name of ["Cards", "Penny", "Calendar", "Profile"]) {
      expect(screen.getByRole("link", { name }).getAttribute("aria-current")).toBeNull();
    }
  });

  it("marks Cards on a card page", () => {
    pathname = "/cards/discover-it-student-cash-back";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Cards" }).getAttribute("aria-current")).toBe("page");
  });

  // The archived bar (components/legacy/) stays drawable, so a rollback is one word in ui-version.ts.
  it("draws the archived three labeled tabs when asked", () => {
    render(<BottomNav look="legacy" />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Home", "Cards", "Learn"]);
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
