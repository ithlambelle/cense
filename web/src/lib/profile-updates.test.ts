import { describe, expect, it } from "vitest";

import { profileUpdates } from "./profile-updates";

const NOW = new Date("2026-11-08T18:00:00Z");
const NY = "America/New_York";

describe("profileUpdates (F5)", () => {
  it("has nothing to show before any reminder is sent", () => {
    expect(profileUpdates([], NY, NOW)).toEqual({ latest: null });
  });

  it("shows the latest sent reminder, with no new count", () => {
    const updates = profileUpdates(
      [
        { kind: "payment_due", occurrence: "2026-11-01", sentAt: "2026-10-29T13:00:00.000Z" },
        { kind: "statement_closing", occurrence: "2026-11-13", sentAt: "2026-11-08T13:00:00.000Z" },
      ],
      NY,
      NOW,
    );
    expect(updates).toEqual({ latest: { title: "Statement closes Nov 13", body: "Pay it down before then.", when: "Today" } });
  });

  it("names the day for an older one", () => {
    const updates = profileUpdates([{ kind: "reapply", occurrence: "2026-11-05", sentAt: "2026-11-05T13:00:00.000Z" }], NY, NOW);
    expect(updates.latest).toMatchObject({ title: "Time to check your plan", when: "Nov 5" });
  });

  it("says Today on the student's calendar, not UTC's", () => {
    // 9 PM in New York on Nov 7 is Nov 8 in UTC; at 10 PM it is still Nov 7 there.
    const sent = [{ kind: "payment_due" as const, occurrence: "2026-11-10", sentAt: "2026-11-08T02:00:00.000Z" }];
    const lateEvening = new Date("2026-11-08T03:00:00Z");
    expect(profileUpdates(sent, NY, lateEvening).latest?.when).toBe("Today");
    // The next morning in New York it is yesterday, named by its New York day.
    expect(profileUpdates(sent, NY, new Date("2026-11-08T14:00:00Z")).latest?.when).toBe("Nov 7");
    expect(profileUpdates(sent, "UTC", new Date("2026-11-08T14:00:00Z")).latest?.when).toBe("Today");
  });
});
