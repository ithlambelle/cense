import { describe, expect, it } from "vitest";

import { addMonths, formatIsoDate, toIsoDate } from "./dates";

describe("dates", () => {
  it("writes a local calendar date", () => {
    expect(toIsoDate(new Date(2026, 9, 16, 23, 59))).toBe("2026-10-16");
  });

  it("adds months and clamps to the end of a shorter month", () => {
    expect(toIsoDate(addMonths(new Date(2026, 9, 16), 6))).toBe("2027-04-16");
    expect(toIsoDate(addMonths(new Date(2026, 7, 31), 6))).toBe("2027-02-28");
    expect(toIsoDate(addMonths(new Date(2027, 7, 31), 6))).toBe("2028-02-29");
  });

  it("formats real dates and refuses impossible ones", () => {
    expect(formatIsoDate("2027-04-16")).toBe("April 16, 2027");
    expect(formatIsoDate("2027-02-30")).toBeNull();
    expect(formatIsoDate("tomorrow")).toBeNull();
  });
});
