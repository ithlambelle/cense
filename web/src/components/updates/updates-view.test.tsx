// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UpdateItem } from "@/lib/reminders/in-app";

import { UpdatesView } from "./updates-view";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/updates", useRouter: () => router }));

const ID = "00000000-0000-4000-8000-0000000000a1";
const item = (over: Partial<UpdateItem> = {}): UpdateItem => ({
  id: ID, kind: "payment_due", group: "new", icon: "calendar", title: "Payment due Nov 8",
  description: "Pay the full statement balance.", sensitive: false, time: "Now",
  action: { type: "paid", label: "I paid it" }, snooze: [], dismissable: true, href: null, ...over,
});
const groups = (items: UpdateItem[]) => ({ new: items, snoozed: [], earlier: [] });

afterEach(() => {
  vi.unstubAllGlobals();
  router.refresh.mockClear();
});

describe("UpdatesView", () => {
  it("offers Dismiss on the card when no snooze time is left, and dismisses it", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}, { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);
    render(<UpdatesView groups={groups([item()])} />);
    expect(screen.queryByRole("button", { name: /^Snooze/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Payment due Nov 8" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0][0]).toBe(`/api/v1/reminders/${ID}/dismiss`);
    expect(fetchFn.mock.calls[0][1]?.method).toBe("POST");
  });

  it("keeps Dismiss in the Snooze sheet while snooze times are left", () => {
    render(<UpdatesView groups={groups([item({ snooze: [{ choice: "tomorrow", label: "Tomorrow morning" }] })])} />);
    expect(screen.getByRole("button", { name: "Snooze Payment due Nov 8" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Dismiss/ })).toBeNull();
  });

  it("offers neither on a card that is done", () => {
    render(<UpdatesView groups={groups([item({ group: "earlier", action: null, dismissable: false })])} />);
    expect(screen.queryByRole("button", { name: /^Dismiss|^Snooze/ })).toBeNull();
  });
});
