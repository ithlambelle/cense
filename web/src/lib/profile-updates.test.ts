import { describe, expect, it } from "vitest";

import { profileUpdates } from "./profile-updates";

const NOW = new Date("2026-11-08T18:00:00Z");

describe("profileUpdates (F5)", () => {
  it("has nothing to show before any reminder is sent", () => {
    expect(profileUpdates([], NOW)).toEqual({ latest: null });
  });

  it("shows the latest sent reminder, with no new count", () => {
    const updates = profileUpdates(
      [
        { kind: "payment_due", occurrence: "2026-11-01", sentAt: "2026-10-29T13:00:00.000Z" },
        { kind: "statement_closing", occurrence: "2026-11-13", sentAt: "2026-11-08T13:00:00.000Z" },
      ],
      NOW,
    );
    expect(updates).toEqual({ latest: { title: "Statement closes Nov 13", body: "Pay it down before then.", when: "Today" } });
  });

  it("names the day for an older one", () => {
    const updates = profileUpdates([{ kind: "reapply", occurrence: "2026-11-05", sentAt: "2026-11-05T13:00:00.000Z" }], NOW);
    expect(updates.latest).toMatchObject({ title: "Time to check your plan", when: "Nov 5" });
  });
});
