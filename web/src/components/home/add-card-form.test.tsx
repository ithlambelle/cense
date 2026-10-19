// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddCardScreen } from "./add-card-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/home/add-card", useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
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

  it("sends the credit limit in cents when one is given", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}, { status: 201 }));
    vi.stubGlobal("fetch", fetchFn);
    render(<AddCardScreen />);
    fireEvent.change(screen.getByLabelText("Credit limit (optional)"), { target: { value: "$1,500" } });
    addCard("Student Cash Card");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).creditLimitCents).toBe(150000);
  });

  it("asks again for a limit it cannot read, and saves nothing", () => {
    const fetchFn = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFn);
    render(<AddCardScreen />);
    fireEvent.change(screen.getByLabelText("Credit limit (optional)"), { target: { value: "five hundred" } });
    addCard("Student Cash Card");
    expect(screen.getByText("Enter the limit in dollars, like 500 or 1,500.")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
