// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";

import { Celebration } from "./celebration";

vi.mock("next/navigation", () => ({ usePathname: () => "/applications/x/approved" }));

const ID = "00000000-0000-4000-8000-000000000001";
const application: Application = {
  id: ID,
  cardId: "discover-it-student-cash-back",
  cardName: "Discover it Student Cash Back",
  status: "approved",
  creditLimitCents: 50000,
  appliedAt: null,
  statusUpdatedAt: "2026-10-16T00:00:00Z",
};

function stubMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce") }));
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  return vibrate;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "vibrate");
  window.history.replaceState(null, "", "/");
});

describe("Celebration", () => {
  it("bursts, buzzes once and dates the approval today when arriving from Mark result", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 22, 14, 0), toFake: ["Date"] });
    const vibrate = stubMotion(false);
    window.history.replaceState(null, "", `/applications/${ID}/approved?celebrate=1`);
    render(<Celebration application={application} celebrate />);
    expect(screen.getByRole("heading", { level: 1, name: "You’re approved!" })).toBeTruthy();
    expect(screen.getByText("Approved Oct 22")).toBeTruthy();
    expect(screen.getByText("Thursday, October 22")).toBeTruthy();
    expect(screen.getByTestId("burst").children).toHaveLength(12);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(40);
    // Dropped from the address, so a reload does not celebrate again.
    expect(window.location.search).toBe("");
  });

  it("keeps still and silent for reduced motion", () => {
    const vibrate = stubMotion(true);
    render(<Celebration application={application} celebrate />);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("opened later: no burst, no buzz and no approval date it cannot know", () => {
    const vibrate = stubMotion(false);
    render(<Celebration application={application} celebrate={false} />);
    expect(screen.queryByTestId("burst")).toBeNull();
    expect(screen.queryByText(/^Approved /)).toBeNull();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("shows the limit with an Edit link, the first month and the way Home", () => {
    stubMotion(false);
    render(<Celebration application={application} celebrate={false} />);
    expect(screen.getByText("$500")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit credit limit" }).getAttribute("href")).toBe(`/applications/${ID}`);
    expect(screen.getByText("0 of 3 lit")).toBeTruthy();
    const card = within(screen.getByRole("region", { name: "Discover it Student Cash Back" }));
    expect(card.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Turn on autopayStatement balance, every month",
      "Plan one purchaseA small cost you already budget for",
      "Set a payment reminderUse the due date on your statement",
    ]);
    expect(screen.getByRole("link", { name: "Go to Home" }).getAttribute("href")).toBe("/home");
  });

  it("leaves the limit out when the student did not add one", () => {
    stubMotion(false);
    render(<Celebration application={{ ...application, creditLimitCents: null }} celebrate={false} />);
    expect(screen.queryByText("Credit limit")).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit credit limit" })).toBeNull();
  });
});
