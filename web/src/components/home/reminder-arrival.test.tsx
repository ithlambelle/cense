// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", () => analytics);

import { ReminderArrival } from "./reminder-arrival";

describe("ReminderArrival", () => {
  it("counts a visit from a reminder email once per page load and drops the mark", () => {
    window.history.replaceState(null, "", "/home?reminder=statement_closing&celebrate=x");
    const { unmount } = render(<ReminderArrival kind="statement_closing" />);
    expect(analytics.track).toHaveBeenCalledWith("reminder_email_clicked", { kind: "statement_closing" });
    expect(window.location.pathname + window.location.search).toBe("/home?celebrate=x");
    unmount();

    // Back to Home inside the app mounts it again: not a second visit
    window.history.replaceState(null, "", "/home?reminder=statement_closing");
    render(<ReminderArrival kind="statement_closing" />);
    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });
});
