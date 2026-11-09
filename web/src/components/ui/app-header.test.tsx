// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "./app-header";

// A stand-in for the browser's Navigation API: this tab's Cense history.
function stubHistory(paths: string[], index = paths.length - 1) {
  const entries = paths.map((path) => ({ url: `${window.location.origin}${path}` }));
  vi.stubGlobal("navigation", {
    entries: () => entries,
    currentEntry: { index },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function click() {
  const link = screen.getByRole("link");
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  fireEvent(link, event);
  return event;
}

describe("AppHeader back arrow", () => {
  it("returns to the screen the student was on, named for screen readers", () => {
    stubHistory(["/home", "/denied/plan?application=a"]);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<AppHeader backHref="/denied?application=a" backLabel="Denial options" />);
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    const event = click();
    expect(back).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("goes to the parent when there is no Cense screen behind (an email link, a new tab)", () => {
    stubHistory(["/denied/plan?application=a"]);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<AppHeader backHref="/home" backLabel="Home" />);
    const link = screen.getByRole("link", { name: "Back to Home" });
    expect(link.getAttribute("href")).toBe("/home");
    click();
    expect(back).not.toHaveBeenCalled();
  });

  it("goes to the parent, not back to sign-in, right after signing in", () => {
    stubHistory(["/sign-in?next=%2Fsettings", "/settings"]);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<AppHeader backHref="/home" backLabel="Home" />);
    click();
    expect(back).not.toHaveBeenCalled();
  });

  it("goes to the parent in a browser without the Navigation API", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<AppHeader backHref="/home" backLabel="Home" />);
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    click();
    expect(back).not.toHaveBeenCalled();
  });
});
