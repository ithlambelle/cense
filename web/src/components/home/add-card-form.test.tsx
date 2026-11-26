// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddCardScreen } from "./add-card-form";

const CATALOG = [
  { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" },
  { id: "discover-it-student-chrome", name: "Discover it Student Chrome" },
  { id: "chase-freedom-rise", name: "Chase Freedom Rise" },
];

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ SENSITIVE: "ph-sensitive", track: (...args: unknown[]) => track(...args) }));
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/home/add-card", useRouter: () => ({ push, replace, refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  replace.mockClear();
  track.mockClear();
});

function addCard(name: string) {
  fireEvent.change(screen.getByLabelText("Card name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Add card" }));
}

describe("AddCardScreen", () => {
  it("saves the card by name as approved, then goes Home", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}, { status: 201 }));
    vi.stubGlobal("fetch", fetchFn);
    render(<AddCardScreen catalog={CATALOG} />);
    addCard("  Student Cash Card ");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({
      cardId: null,
      cardName: "Student Cash Card",
      status: "approved",
      creditLimitCents: null,
    });
  });

  it("opened from Profile, Back, Cancel and Add card all return to Profile, replacing the form", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({}, { status: 201 })));
    const { unmount } = render(<AddCardScreen catalog={CATALOG} fromAccount />);
    expect(screen.getByRole("link", { name: "Back to Your account" }).getAttribute("href")).toBe("/settings");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(replace).toHaveBeenCalledWith("/settings");
    unmount();
    replace.mockClear();
    render(<AddCardScreen catalog={CATALOG} fromAccount />);
    addCard("Student Cash Card");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings"));
    expect(push).not.toHaveBeenCalled();
  });

  it("opened from Home, Cancel returns Home, replacing the form", () => {
    render(<AddCardScreen catalog={CATALOG} />);
    expect(screen.getByRole("link", { name: "Back to Home" }).getAttribute("href")).toBe("/home");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(replace).toHaveBeenCalledWith("/home");
    expect(push).not.toHaveBeenCalled();
  });

  it("at the card limit, says so plainly and stays on the form", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () =>
      Response.json({ error: { code: "limit_reached", message: "You’ve reached the card limit." } }, { status: 409 })));
    render(<AddCardScreen catalog={CATALOG} />);
    addCard("Student Cash Card");
    expect((await screen.findByRole("alert")).textContent).toBe("You’ve reached the card limit.");
    expect(push).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("on a network failure, says the card may have been saved instead of inviting a duplicate", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<AddCardScreen catalog={CATALOG} />);
    addCard("Student Cash Card");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "We couldn’t confirm that. Go back and check your cards before adding it again.",
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add card" }).hasAttribute("disabled")).toBe(false);
  });

  it.each([["$1,250.50", 125050], ["500", 50000], ["100,000", 10000000]])(
    "saves an optional limit of %s in cents without sending it to analytics",
    async (limit, cents) => {
      const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}, { status: 201 }));
      vi.stubGlobal("fetch", fetchFn);
      render(<AddCardScreen catalog={CATALOG} />);
      fireEvent.change(screen.getByLabelText("Credit limit (optional)"), { target: { value: limit } });
      addCard("Student Cash Card");
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
      expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).creditLimitCents).toBe(cents);
      expect(track.mock.calls).toEqual([["card_added", { method: "manual" }]]);
    },
  );

  it.each(["abc", "-500", "0", "0.50", "1,25", "500.001", "100001"])(
    "refuses an invalid limit of %s before saving",
    async (limit) => {
      const fetchFn = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchFn);
      render(<AddCardScreen catalog={CATALOG} />);
      const field = screen.getByLabelText("Credit limit (optional)");
      fireEvent.change(field, { target: { value: limit } });
      addCard("Student Cash Card");
      expect((await screen.findByRole("alert")).textContent).toContain("Enter the limit in dollars");
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(fetchFn).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("masks the credit limit in replay and preserves both fields after a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<AddCardScreen catalog={CATALOG} />);
    const field = screen.getByLabelText("Credit limit (optional)") as HTMLInputElement;
    expect(field.closest(".ph-sensitive")).not.toBeNull();
    fireEvent.change(field, { target: { value: "$750" } });
    addCard("Student Cash Card");
    await screen.findByRole("alert");
    expect(field.value).toBe("$750");
    expect((screen.getByLabelText("Card name") as HTMLInputElement).value).toBe("Student Cash Card");
    expect(field.getAttribute("readonly")).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("AddCardScreen, picking from the catalog", () => {
  it("saves a picked card with its catalog id and the catalog's name", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}, { status: 201 }));
    vi.stubGlobal("fetch", fetchFn);
    render(<AddCardScreen catalog={CATALOG} />);
    fireEvent.change(screen.getByLabelText("Card name"), { target: { value: "discover cash" } });
    expect((await screen.findByRole("status")).textContent).toBe("1 card matches");
    fireEvent.click(screen.getByRole("button", { name: "Discover it Student Cash Back" }));
    expect((screen.getByLabelText("Card name") as HTMLInputElement).value).toBe("Discover it Student Cash Back");
    expect(screen.queryByRole("list", { name: "Cards that match" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({
      cardId: "discover-it-student-cash-back",
      cardName: "Discover it Student Cash Back",
      status: "approved",
      creditLimitCents: null,
    });
  });

  it("gives a name typed in full its catalog id, and drops a pick once the name is edited", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}, { status: 201 }));
    vi.stubGlobal("fetch", fetchFn);
    render(<AddCardScreen catalog={CATALOG} />);
    addCard("chase freedom rise");
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toMatchObject({ cardId: "chase-freedom-rise", cardName: "Chase Freedom Rise" });
  });

  it("keeps the name as typed, with no id, after My card isn't listed", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}, { status: 201 }));
    vi.stubGlobal("fetch", fetchFn);
    render(<AddCardScreen catalog={CATALOG} />);
    const field = screen.getByLabelText("Card name");
    fireEvent.change(field, { target: { value: "Discover" } });
    fireEvent.click(screen.getByRole("button", { name: "Discover it Student Chrome" }));
    // Editing the picked name drops the pick and lists the matches again.
    fireEvent.change(field, { target: { value: "Discover it Stu" } });
    expect(screen.getByRole("list", { name: "Cards that match" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "My card isn’t listed" }));
    expect(screen.queryByRole("list", { name: "Cards that match" })).toBeNull();
    fireEvent.change(field, { target: { value: "Discover it Student" } });
    expect(screen.queryByRole("list", { name: "Cards that match" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toMatchObject({ cardId: null, cardName: "Discover it Student" });
  });

  it("says plainly when the card is already on the student's list", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () =>
      Response.json({ error: { code: "already_exists", message: "An active record for this card already exists." } }, { status: 409 })));
    render(<AddCardScreen catalog={CATALOG} />);
    addCard("Chase Freedom Rise");
    expect((await screen.findByRole("alert")).textContent).toBe("This card is already on your list.");
    expect(replace).not.toHaveBeenCalled();
  });
});
