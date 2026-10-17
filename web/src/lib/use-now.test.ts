// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calendarDaysBetween, useNow } from "./use-now";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("reads the student's clock to the minute", () => {
    vi.setSystemTime(new Date("2026-10-17T09:15:42"));
    const { result, unmount } = renderHook(() => useNow());
    expect(result.current).toEqual(new Date("2026-10-17T09:15:00"));
    unmount();
  });

  it("moves on with the clock while a screen is open", () => {
    vi.setSystemTime(new Date("2026-10-17T09:15:00"));
    const { result, unmount } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toEqual(new Date("2026-10-17T09:16:00"));
    unmount();
  });

  it("reads the clock again when the tab comes back into view", () => {
    vi.setSystemTime(new Date("2026-10-17T22:00:00"));
    const { result, unmount } = renderHook(() => useNow());
    // A sleeping laptop: the clock jumps without the interval running.
    vi.setSystemTime(new Date("2026-10-18T07:30:00"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toEqual(new Date("2026-10-18T07:30:00"));
    unmount();
  });

  it("shows the current time, not the last one kept, when a screen opens after every other has closed", () => {
    vi.setSystemTime(new Date("2026-10-17T09:00:00"));
    const first = renderHook(() => useNow());
    expect(first.result.current).toEqual(new Date("2026-10-17T09:00:00"));
    first.unmount();
    // A day and a half on another screen with no clock on it.
    vi.setSystemTime(new Date("2026-10-18T19:00:00"));
    const second = renderHook(() => useNow());
    expect(second.result.current).toEqual(new Date("2026-10-18T19:00:00"));
    second.unmount();
  });
});

describe("calendarDaysBetween", () => {
  it("is 0 on the same day, whatever the hours", () => {
    expect(calendarDaysBetween(new Date("2026-10-17T00:01:00"), new Date("2026-10-17T23:59:00"))).toBe(0);
  });

  it("counts calendar days, not 24-hour spans", () => {
    expect(calendarDaysBetween(new Date("2026-10-17T23:59:00"), new Date("2026-10-18T00:01:00"))).toBe(1);
    expect(calendarDaysBetween(new Date("2026-12-31T12:00:00"), new Date("2027-01-02T08:00:00"))).toBe(2);
  });

  it("is negative when the second date is earlier", () => {
    expect(calendarDaysBetween(new Date("2026-10-18T09:00:00"), new Date("2026-10-17T09:00:00"))).toBe(-1);
  });

  it("stays whole across a daylight saving change", () => {
    // US clocks go back on 2026-11-01 and forward on 2027-03-14: a 25- or
    // 23-hour day still counts as one day in any time zone.
    expect(calendarDaysBetween(new Date("2026-10-31T12:00:00"), new Date("2026-11-02T12:00:00"))).toBe(2);
    expect(calendarDaysBetween(new Date("2027-03-13T12:00:00"), new Date("2027-03-15T12:00:00"))).toBe(2);
  });
});
