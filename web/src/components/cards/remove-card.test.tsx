// @vitest-environment jsdom
// Created with Claude Code (2026-11-26). "Remove this card" and its sheet.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoveCard } from "./remove-card";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh, push: vi.fn() }) }));

const ID = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
  refresh.mockClear();
});

function open() {
  render(<RemoveCard applicationId={ID} cardName="Chase Freedom Rise" signInNext="/cards/chase-freedom-rise" />);
  fireEvent.click(screen.getByRole("button", { name: "Remove this card" }));
}

describe("RemoveCard", () => {
  it("says plainly what is removed before anything is", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFn);
    open();
    const sheet = await screen.findByRole("dialog", { name: "Remove this card?" });
    expect(sheet.textContent).toContain("We remove Chase Freedom Rise from Cense, with its reminders and setup steps.");
    expect(sheet.textContent).toContain("Your card stays open at your bank.");
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("removes the card, then replaces this page with Home", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchFn);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Remove card" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(String(fetchFn.mock.calls[0][0])).toContain(`/api/v1/applications/${ID}`);
    expect(fetchFn.mock.calls[0][1]?.method?.toUpperCase()).toBe("DELETE");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the sheet open with the reason when it fails", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () =>
      Response.json({ error: { code: "not_removable", message: "Only a card you added yourself can be removed." } }, { status: 409 })));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Remove card" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Only a card you added yourself can be removed.");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
