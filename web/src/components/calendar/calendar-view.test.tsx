// @vitest-environment jsdom
// Created with Claude Code (2026-11-21). The Calendar screen (Figma C1).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NO_CAPTURE, SENSITIVE } from "@/lib/analytics";
import type { CalendarEntry } from "@/lib/calendar/month";

import { CalendarView } from "./calendar-view";

vi.mock("@/components/ui/bottom-nav", () => ({ BottomNav: () => <nav aria-label="Main" /> }));

const ENTRIES: CalendarEntry[] = [
  { key: "bill-phone", date: "2026-11-01", dot: "bill", what: "Phone", subtitle: "$45 · you cover it", href: "/home" },
  { key: "due", date: "2026-11-12", dot: "card", what: "Payment due", subtitle: "Discover · autopay is on", href: "/home" },
  { key: "rent", date: "2026-11-15", dot: "bill", what: "Rent", subtitle: "$650 · you cover it", href: "/home" },
  { key: "pay", date: "2026-11-15", dot: "money", what: "Paycheck", subtitle: "$480 · looks like pay", href: "/home" },
];

function rows() {
  return within(screen.getByRole("region")).queryAllByRole("listitem").map((item) => item.textContent);
}

describe("CalendarView", () => {
  it("shows the month, today, and what is next from today", () => {
    render(<CalendarView today="2026-11-11" entries={ENTRIES} />);
    expect(screen.getByRole("heading", { level: 1, name: "November" })).toBeTruthy();
    const today = screen.getByRole("button", { name: "Today, Wednesday, November 11" });
    expect(today.getAttribute("aria-current")).toBe("date");
    // The phone bill on the 1st has passed: it keeps its dot but is not next.
    expect(rows()).toEqual([
      "Tomorrow · Payment dueDiscover · autopay is on",
      "Sun, Nov 15 · Rent$650 · you cover it",
      "Sun, Nov 15 · Paycheck$480 · looks like pay",
    ]);
  });

  it("names each day's dots for a screen reader", () => {
    render(<CalendarView today="2026-11-11" entries={ENTRIES} />);
    expect(screen.getByRole("button", { name: "Sunday, November 15: Bills, Money in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sunday, November 1: Bills" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saturday, November 14" })).toBeTruthy();
  });

  it("lists a tapped day's dates, and goes back to what is next on a second tap", () => {
    render(<CalendarView today="2026-11-11" entries={ENTRIES} />);
    const fifteenth = screen.getByRole("button", { name: /November 15/ });
    fireEvent.click(fifteenth);
    expect(fifteenth.getAttribute("aria-pressed")).toBe("true");
    expect(rows()).toEqual(["Sun, Nov 15 · Rent$650 · you cover it", "Sun, Nov 15 · Paycheck$480 · looks like pay"]);
    fireEvent.click(fifteenth);
    expect(fifteenth.getAttribute("aria-pressed")).toBe("false");
    expect(rows()).toHaveLength(3);
  });

  it("says so when a tapped day has nothing", () => {
    render(<CalendarView today="2026-11-11" entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: "Today, Wednesday, November 11" }));
    expect(screen.getByText("No dates saved for today.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Saturday, November 14" }));
    expect(screen.getByText("No dates saved for Sat, Nov 14.")).toBeTruthy();
  });

  it("says so when nothing else is coming this month", () => {
    render(<CalendarView today="2026-11-20" entries={ENTRIES} />);
    expect(screen.getByText("No more dates saved this month.")).toBeTruthy();
  });

  it("masks every row in session replay, card names included", () => {
    render(<CalendarView today="2026-11-11" entries={ENTRIES} />);
    for (const text of ["$650 · you cover it", "Discover · autopay is on"]) {
      expect(screen.getByText(text).closest("a")!.className.split(" ")).toContain(SENSITIVE);
    }
  });

  it("keeps a day's name, which lists its kinds of dates, out of autocapture", () => {
    render(<CalendarView today="2026-11-11" entries={ENTRIES} />);
    expect(screen.getByRole("group", { name: "November days" }).className.split(" ")).toContain(NO_CAPTURE);
  });

  it("never says a day is empty when a read failed", () => {
    render(<CalendarView today="2026-11-11" entries={[]} incomplete />);
    expect(screen.getByText("Some dates didn’t load. Refresh to try again.")).toBeTruthy();
    expect(screen.queryByText("No more dates saved this month.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Saturday, November 14" }));
    expect(screen.queryByText("No dates saved for Sat, Nov 14.")).toBeNull();
  });

  it("keys only the kinds of dot on this month's calendar", () => {
    render(<CalendarView today="2026-11-11" entries={ENTRIES.filter((entry) => entry.dot !== "money")} />);
    const legend = screen.getByRole("list", { name: "What the dots mean" });
    expect(legend.textContent).toContain("Bills");
    expect(legend.textContent).not.toContain("Money in");
  });
});
