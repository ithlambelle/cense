// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  applyAnalyticsChoice: vi.fn(),
  browserAsksNotToTrack: vi.fn(() => false),
}));
vi.mock("@/lib/analytics", () => analytics);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings/privacy" }));

import { PrivacyView } from "./privacy-view";

const STUDENT = "00000000-0000-4000-8000-000000000001";

function server(answer: () => Response | Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async () => answer());
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  analytics.browserAsksNotToTrack.mockReturnValue(false);
});

describe("PrivacyView", () => {
  it("turns analytics off: saves it, then applies it in this browser", async () => {
    const fetchFn = server(() => Response.json({ analyticsOn: false }));
    render(<PrivacyView analyticsOn={true} studentId={STUDENT} isInternal={false} />);
    const toggle = screen.getByRole("switch", { name: "Analytics" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(analytics.applyAnalyticsChoice).toHaveBeenCalledWith(false, STUDENT, false));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/me/privacy");
    expect(fetchFn.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ analyticsOn: false });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("moves back and says so when the save fails, and applies nothing", async () => {
    server(() => Promise.reject(new TypeError("offline")));
    render(<PrivacyView analyticsOn={true} studentId={STUDENT} isInternal={false} />);
    fireEvent.click(screen.getByRole("switch", { name: "Analytics" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^We couldn’t reach Cense/);
    expect(screen.getByRole("switch", { name: "Analytics" }).getAttribute("aria-checked")).toBe("true");
    expect(analytics.applyAnalyticsChoice).not.toHaveBeenCalled();
  });

  it("shows off and locked when the browser sends Global Privacy Control", () => {
    analytics.browserAsksNotToTrack.mockReturnValue(true);
    render(<PrivacyView analyticsOn={true} studentId={STUDENT} isInternal={false} />);
    const toggle = screen.getByRole("switch", { name: "Analytics" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.hasAttribute("data-disabled")).toBe(true);
    expect(screen.getByText("Off: your browser asks sites not to track you.")).toBeTruthy();
  });

  it("says so, and locks the switch, when the setting could not be read", () => {
    render(<PrivacyView analyticsOn={null} studentId={STUDENT} isInternal={false} />);
    expect(screen.getByRole("alert").textContent).toBe("We couldn’t load this setting. Reload to try again.");
    expect(screen.getByRole("switch", { name: "Analytics" }).hasAttribute("data-disabled")).toBe(true);
  });
});
