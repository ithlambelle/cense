// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  applyAnalyticsChoice: vi.fn(),
  browserAsksNotToTrack: vi.fn(() => false),
  forgetDeletedStudent: vi.fn(),
  pauseAnalytics: vi.fn(async () => vi.fn()),
}));
vi.mock("@/lib/analytics", () => analytics);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings/privacy" }));

import { PrivacyView } from "./privacy-view";

const STUDENT = "00000000-0000-4000-8000-000000000001";

// Delete ignores taps for its first 600 ms (the tap that opened the sheet).
const pastGuard = () => new Promise((resolve) => setTimeout(resolve, 650));

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

describe("Delete my account", () => {
  it("asks first; Keep my account deletes nothing", async () => {
    const fetchFn = server(() => new Response(null, { status: 204 }));
    render(<PrivacyView analyticsOn={true} studentId={STUDENT} isInternal={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    const sheet = await screen.findByRole("dialog", { name: "Delete your account?" });
    // PostHog queues the analytics deletion (the policy's 30 days); "cards you
    // track", so no one fears their real card is closed.
    expect([...sheet.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Cards you track, quiz answers, plans and reminders are deleted now.",
      "Your analytics follow within 30 days.",
      "This can’t be undone.",
    ]);
    // Keeping the account is the first and main button.
    const buttons = [...sheet.querySelectorAll("button")].map((b) => b.textContent).filter((t) => t !== "");
    expect(buttons).toEqual(["Keep my account", "Delete my account"]);
    fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("pauses analytics, deletes, forgets the student and lands signed out", async () => {
    const order: string[] = [];
    analytics.pauseAnalytics.mockImplementation(async () => {
      order.push("pause");
      return vi.fn();
    });
    analytics.forgetDeletedStudent.mockImplementation(() => void order.push("forget"));
    const fetchFn = server(() => {
      order.push("delete");
      return new Response(null, { status: 204 });
    });
    sessionStorage.setItem("cense:pending-apply", "sample-card");
    render(<PrivacyView analyticsOn={true} studentId={STUDENT} isInternal={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    const sheet = await screen.findByRole("dialog", { name: "Delete your account?" });
    await pastGuard();
    fireEvent.click(sheet.querySelector("button.ph-no-capture")!);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/account-deleted"));
    expect(order).toEqual(["pause", "delete", "forget"]);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/me");
    expect(fetchFn.mock.calls[0][1]?.method).toBe("DELETE");
    expect(sessionStorage.getItem("cense:pending-apply")).toBeNull();
  });

  it("resumes analytics and shows the reason when the deletion fails", async () => {
    const resume = vi.fn();
    analytics.pauseAnalytics.mockResolvedValue(resume);
    server(() => Response.json({ error: { code: "deletion_failed", message: "We couldn’t delete your account. Please try again." } }, { status: 502 }));
    render(<PrivacyView analyticsOn={true} studentId={STUDENT} isInternal={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    const sheet = await screen.findByRole("dialog", { name: "Delete your account?" });
    await pastGuard();
    fireEvent.click(sheet.querySelector("button.ph-no-capture")!);
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn’t delete your account. Please try again.");
    expect(screen.getByRole("link", { name: "privacy@censefinance.com" }).getAttribute("href")).toBe("mailto:privacy@censefinance.com");
    expect(resume).toHaveBeenCalledOnce();
    expect(analytics.forgetDeletedStudent).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("ignores a tap on Delete in the first moment after the sheet opens", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchFn = server(() => new Response(null, { status: 204 }));
    render(<PrivacyView analyticsOn={true} studentId={STUDENT} isInternal={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    const sheet = await screen.findByRole("dialog", { name: "Delete your account?" });
    fireEvent.click(sheet.querySelector("button.ph-no-capture")!);
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    fireEvent.click(sheet.querySelector("button.ph-no-capture")!);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
    vi.useRealTimers();
  });
});
