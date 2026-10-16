import { describe, expect, it } from "vitest";

import { dollars, STATUS_LABELS, statusDetail } from "./applications";

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  cardId: null,
  cardName: "Example",
  creditLimitCents: null,
  appliedAt: null,
  statusUpdatedAt: "2026-10-11T12:00:00Z",
};

describe("application status wording", () => {
  it("has plain words for every status", () => {
    expect(STATUS_LABELS).toEqual({ applied: "Applied", approved: "Approved", rejected: "Not approved" });
  });

  it("writes a credit limit from whole cents", () => {
    expect(dollars(50000)).toBe("$500");
    expect(dollars(150000)).toBe("$1,500");
  });

  it("shows the limit on an approved card", () => {
    expect(statusDetail({ ...base, status: "approved", creditLimitCents: 50000 })).toBe("$500 credit limit");
  });

  it("shows the application date in the viewer's time zone", () => {
    const evening = { ...base, status: "applied" as const, appliedAt: "2026-10-12T01:30:00Z" };
    expect(statusDetail(evening, "America/New_York")).toBe("On Oct 11");
    expect(statusDetail(evening, "UTC")).toBe("On Oct 12");
  });

  it("adds nothing when there is nothing to add", () => {
    expect(statusDetail({ ...base, status: "approved" })).toBeNull();
    expect(statusDetail({ ...base, status: "rejected" })).toBeNull();
  });
});
