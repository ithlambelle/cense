import { describe, expect, it } from "vitest";

import { profileUpdates } from "./profile-updates";

const NOW = new Date("2026-11-08T18:00:00Z");

describe("profileUpdates (F5)", () => {
  it("has nothing to show before any reminder is sent", () => {
    expect(profileUpdates([], null, NOW)).toEqual({ newCount: 0, latest: null });
  });

  it("counts every sent reminder as new until updates are seen, and shows the latest", () => {
    const updates = profileUpdates(
      [
        { kind: "payment_due", occurrence: "2026-11-01", sentAt: "2026-10-29T13:00:00.000Z" },
        { kind: "statement_closing", occurrence: "2026-11-13", sentAt: "2026-11-08T13:00:00.000Z" },
      ],
      null,
      NOW,
    );
    expect(updates.newCount).toBe(2);
    expect(updates.latest).toEqual({ title: "Statement closes Nov 13", body: "Pay it down before then.", when: "Today" });
  });

  it("counts only the ones sent after the student last saw them", () => {
    const updates = profileUpdates(
      [
        { kind: "payment_due", occurrence: "2026-11-01", sentAt: "2026-10-29T13:00:00.000Z" },
        { kind: "reapply", occurrence: "2026-11-05", sentAt: "2026-11-05T13:00:00.000Z" },
      ],
      "2026-11-01T00:00:00Z",
      NOW,
    );
    expect(updates.newCount).toBe(1);
    expect(updates.latest).toMatchObject({ title: "Time to check your plan", when: "Nov 5" });
  });
});
