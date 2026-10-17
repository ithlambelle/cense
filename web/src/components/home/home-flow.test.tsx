// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeFlow } from "./home-flow";

const replace = vi.fn();
// One router object for every render, as the real hook returns.
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/home",
}));

function answer(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("HomeFlow", () => {
  it("shows three choices when nothing is saved", async () => {
    vi.stubGlobal("fetch", answer(200, { applications: [] }));
    render(<HomeFlow />);
    expect((await screen.findByRole("link", { name: "Take the quiz" })).getAttribute("href")).toBe("/quiz");
    expect(screen.getByRole("button", { name: "Add a card I already have" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse cards" }).getAttribute("href")).toBe("/cards");
  });

  it("shows each card's status in plain words", async () => {
    vi.stubGlobal(
      "fetch",
      answer(200, {
        applications: [
          {
            id: "1",
            cardId: null,
            cardName: "Sample Card",
            status: "approved",
            creditLimitCents: 50000,
            appliedAt: null,
            statusUpdatedAt: "2026-10-11T00:00:00Z",
          },
        ],
      }),
    );
    render(<HomeFlow />);
    expect(await screen.findByRole("heading", { name: "Sample Card" })).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText("$500 credit limit")).toBeTruthy();
  });

  it("has Home and Cards in the bottom bar, with Home marked current", async () => {
    vi.stubGlobal("fetch", answer(200, { applications: [] }));
    render(<HomeFlow />);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((link) => link.textContent)).toEqual(["Home", "Cards"]);
    expect(links[0].getAttribute("aria-current")).toBe("page");
    expect(links[1].hasAttribute("aria-current")).toBe(false);
  });

  it("sends a signed-out student to sign in, with a way back to Home", async () => {
    vi.stubGlobal("fetch", answer(401, { error: { code: "unauthorized", message: "Sign in to continue." } }));
    render(<HomeFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
  });

  it("shows the problem and a way to retry when the read fails", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("crash", { status: 500 })));
    render(<HomeFlow />);
    expect((await screen.findByRole("alert")).textContent).not.toContain("crash");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("reloads the list when the add form is closed, in case an unanswered add was saved", async () => {
    const fetchFn = answer(200, { applications: [] });
    vi.stubGlobal("fetch", fetchFn);
    render(<HomeFlow />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a card I already have" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByRole("link", { name: "Take the quiz" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][0]).toBe("/api/v1/applications");
  });

  it("adds a card the student already has as approved, by name only", async () => {
    const fetchFn = answer(200, { applications: [] });
    vi.stubGlobal("fetch", fetchFn);
    render(<HomeFlow />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a card I already have" }));
    fireEvent.change(screen.getByLabelText("Card name"), { target: { value: "  Sample Card  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    await vi.waitFor(() => expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(fetchFn.mock.calls[1][0]).toBe("/api/v1/applications");
    expect(fetchFn.mock.calls[1][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({
      cardId: null,
      cardName: "Sample Card",
      status: "approved",
      creditLimitCents: null,
    });
  });
});
