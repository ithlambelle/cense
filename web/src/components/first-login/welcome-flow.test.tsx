// @vitest-environment jsdom
// Created with Claude Code (2026-11-19). The first sign-in welcome as a
// student meets it: W1 moves on by itself after about 1.5 seconds or at a
// tap, W2 waits for "Let's go", which saves the welcome before moving on.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

type Result = { ok: true; data: null } | { ok: false; kind: "api"; status: number; code: string; message: string } | { ok: false; kind: "network" };
const apiRequest = vi.fn<(method: string, path: string) => Promise<Result>>();
vi.mock("@/lib/api-client/client", async (original) => ({
  ...(await original<typeof import("@/lib/api-client/client")>()),
  apiRequest: (method: string, path: string) => apiRequest(method, path),
}));

import { ADVANCE_MS, WELCOME_COPY, WelcomeFlow } from "./welcome-flow";
import { STARS } from "./star-field";

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("W1, We're so glad you're here", () => {
  it("shows Penny's hello and the stars, with no button to find", () => {
    const { container } = render(<WelcomeFlow next="/start/link-bank" />);
    expect(heading()).toBe("We’re so glad you’re here!");
    expect(screen.getByText("Hi, I’m Penny.")).toBeTruthy();
    expect(container.querySelector('img[src="/mascot/astro-pig/hello.png"]')?.getAttribute("srcset")).toBe(
      "/mascot/astro-pig/hello.png 1x, /mascot/astro-pig/hello@2x.png 2x",
    );
    expect(container.querySelectorAll("[data-star]")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: WELCOME_COPY.goAction })).toBeNull();
  });

  it("moves on to W2 by itself after about 1.5 seconds", () => {
    render(<WelcomeFlow next="/start/link-bank" />);
    act(() => vi.advanceTimersByTime(ADVANCE_MS - 1));
    expect(heading()).toBe("We’re so glad you’re here!");
    act(() => vi.advanceTimersByTime(1));
    expect(heading()).toBe("Let’s make money make Cense!");
    expect(ADVANCE_MS).toBe(1500);
  });

  it("moves on at once with a tap anywhere on the screen", () => {
    render(<WelcomeFlow next="/start/link-bank" />);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(heading()).toBe("Let’s make money make Cense!");
  });

  it("lights the stars one by one, then turns each into its W2 place and state", () => {
    const { container } = render(<WelcomeFlow next="/start/link-bank" />);
    const stars = () => [...container.querySelectorAll<HTMLElement>("[data-star]")];
    expect(stars().map((star) => star.dataset.star)).toEqual(STARS.map((star) => star.hello.kind));
    const delays = stars().map((star) => (star.firstElementChild as HTMLElement).style.getPropertyValue("--star-delay"));
    expect(delays).toEqual(["150ms", "260ms", "370ms", "480ms", "590ms", "700ms", "810ms", "920ms"]);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(stars().map((star) => star.dataset.star)).toEqual(STARS.map((star) => star.go.kind));
    // The frame's top-left star, centred at (50, 100) of 390 by 844.
    expect(stars()[0].style.left).toBe(`${(50 / 390) * 100}%`);
  });
});

describe("W2, Let's make money make Cense", () => {
  function openW2() {
    render(<WelcomeFlow next="/start/link-bank" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("shows the frame's words, Penny's thumbs up and Let's go, and takes focus to the new heading", () => {
    const { container } = render(<WelcomeFlow next="/start/link-bank" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("First, link your bank so I can find your next step.")).toBeTruthy();
    expect(container.querySelector('img[src="/mascot/astro-pig/thumbs-up.png"]')?.getAttribute("srcset")).toBe(
      "/mascot/astro-pig/thumbs-up.png 1x, /mascot/astro-pig/thumbs-up@2x.png 2x",
    );
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    const go = screen.getByRole("button", { name: "Let’s go" });
    expect(go.className).toContain("bg-white");
    expect(go.querySelector("svg")).toBeTruthy();
  });

  it("never asks a student to link a bank when Let's go leads to Your next step instead", () => {
    const { container } = render(<WelcomeFlow next="/start/next-step" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("First, let’s find your next step.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/link your bank/i);
  });

  it("never moves on by itself", () => {
    openW2();
    act(() => vi.advanceTimersByTime(60_000));
    expect(heading()).toBe("Let’s make money make Cense!");
    expect(apiRequest).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("saves the welcome before it moves on, so it can never come back", async () => {
    let answer: (result: Result) => void = () => undefined;
    apiRequest.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    openW2();
    fireEvent.click(screen.getByRole("button", { name: "Let’s go" }));
    expect(apiRequest).toHaveBeenCalledWith("put", "/me/welcome");
    // Still saving: nowhere to go yet, and a second tap sends nothing more.
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Let’s go" }));
    expect(apiRequest).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true, data: null }));
    expect(replace).toHaveBeenCalledWith("/start/link-bank");
  });

  it("goes where the server said: Your next step when there is no bank to link", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: null });
    render(<WelcomeFlow next="/start/next-step" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Let’s go" })));
    expect(replace).toHaveBeenCalledWith("/start/next-step");
  });

  it("stays and says so when the save fails, and the next tap tries again", async () => {
    apiRequest.mockResolvedValueOnce({ ok: false, kind: "network" });
    openW2();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Let’s go" })));
    expect(screen.getByRole("alert").textContent).toBe("We couldn’t reach Cense. Check your connection, then try again.");
    expect(replace).not.toHaveBeenCalled();
    apiRequest.mockResolvedValueOnce({ ok: true, data: null });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Let’s go" })));
    expect(replace).toHaveBeenCalledWith("/start/link-bank");
  });

  it("sends a student whose session ended to sign in", async () => {
    apiRequest.mockResolvedValueOnce({ ok: false, kind: "api", status: 401, code: "unauthorized", message: "Sign in to continue." });
    openW2();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Let’s go" })));
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});

describe("motion", () => {
  // Every class in these files that moves something must be switched off for
  // reduced motion, so the words show with no movement (the W1 card).
  for (const file of ["src/components/first-login/welcome.module.css", "src/components/safe-to-spend/connect-view.module.css"]) {
    it(`${file} keeps still with reduced motion`, () => {
      const css = readFileSync(resolve(process.cwd(), file), "utf8");
      const [motion, reduced] = css.split("@media (prefers-reduced-motion: reduce)");
      const moving = [...motion.matchAll(/\.([a-zA-Z]+)\s*\{[^}]*\b(animation|transition):/g)].map((match) => match[1]);
      expect(moving.length).toBeGreaterThan(0);
      for (const name of moving) expect(reduced, name).toMatch(new RegExp(`\\.${name}\\b`));
      expect(reduced).toMatch(/animation: none/);
    });
  }

  it("moves with CSS only: W1 moves on with a timer, never a script-driven entrance", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/first-login/welcome-flow.tsx"), "utf8");
    expect(source).not.toMatch(/framer-motion|motion\/react|requestAnimationFrame|\.animate\(/);
  });
});
