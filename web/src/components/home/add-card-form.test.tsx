// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddCardScreen } from "./add-card-form";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ SENSITIVE: "ph-sensitive", track: (...args: unknown[]) => track(...args) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/home/add-card", useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
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
    render(<AddCardScreen />);
    addCard("  Student Cash Card ");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({
      cardId: null,
      cardName: "Student Cash Card",
      status: "approved",
      creditLimitCents: null,
    });
  });

  it("on a network failure, says the card may have been saved instead of inviting a duplicate", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<AddCardScreen />);
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
      render(<AddCardScreen />);
      fireEvent.change(screen.getByLabelText("Credit limit (optional)"), { target: { value: limit } });
      addCard("Student Cash Card");
      await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
      expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).creditLimitCents).toBe(cents);
      expect(track.mock.calls).toEqual([["card_added", { method: "manual" }]]);
    },
  );

  it.each(["abc", "-500", "0", "0.50", "1,25", "500.001", "100001"])(
    "refuses an invalid limit of %s before saving",
    async (limit) => {
      const fetchFn = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchFn);
      render(<AddCardScreen />);
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
    render(<AddCardScreen />);
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
