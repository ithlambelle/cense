// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";

import { FirstMonthPlan } from "./first-month-plan";

// Lets a test make the next load throw, as a bug in this app would.
const loadBug = vi.hoisted(() => ({ throwOnce: false }));
vi.mock("@/lib/api-client/plans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client/plans")>();
  return {
    ...actual,
    loadPlanSteps: ((...args: Parameters<typeof actual.loadPlanSteps>) => {
      if (loadBug.throwOnce) {
        loadBug.throwOnce = false;
        return Promise.reject(new Error("bug"));
      }
      return actual.loadPlanSteps(...args);
    }) as typeof actual.loadPlanSteps,
  };
});

const replace = vi.fn();
// One router for every render, as in the app (useLoaded reloads when it changes).
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/plan", useRouter: () => router }));

const application: Application = {
  id: "00000000-0000-4000-8000-000000000001",
  cardId: null,
  cardName: "Sample Bank Card",
  status: "approved",
  creditLimitCents: 50000,
  appliedAt: null,
  statusUpdatedAt: "2026-10-16T00:00:00Z",
};

const PLAN_URL = `/api/v1/applications/${application.id}/plans/first_month`;
const APPLICATION_URL = `/api/v1/applications/${application.id}`;

const plan = (...steps: string[]) => ({
  applicationId: application.id,
  plan: "first_month",
  completedSteps: steps.map((step) => ({ step, completedAt: "2026-10-16T00:00:00Z" })),
});

function server(replies: { status: number; body: unknown }[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return reply.status === 204 ? new Response(null, { status: 204 }) : Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  replace.mockClear();
  router.refresh.mockClear();
});

describe("FirstMonthPlan", () => {
  it("offers to try again when the plan is briefly unavailable (503)", async () => {
    server([
      { status: 503, body: { error: { code: "data_unavailable", message: "Your data is temporarily unavailable. Please try again." } } },
      { status: 200, body: plan("payment_reminder") },
    ]);
    render(<FirstMonthPlan application={application} paymentReminderOn />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
  });

  it("opens the spend limit screens from the spend limit action, done only while a limit is saved", async () => {
    const fetchFn = server([{ status: 200, body: plan("spend_limit") }, { status: 200, body: plan() }]);
    const { unmount } = render(<FirstMonthPlan application={application} />);
    // A step left from before, with no limit saved, is not done.
    expect(await screen.findByText("0 of 3 done")).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe(PLAN_URL);
    expect(screen.queryByRole("checkbox", { name: /Set a spend limit/ })).toBeNull();
    const link = screen.getByRole("link", { name: /^Set a spend limit/ });
    expect(link.getAttribute("href")).toBe(`/applications/${application.id}/setup/spend-limit/suggestion`);
    fireEvent.click(link);
    expect(fetchFn).toHaveBeenCalledOnce();
    unmount();

    render(<FirstMonthPlan application={{ ...application, creditLimitCents: null }} spendLimitSet />);
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    // No credit limit saved: it asks for that first (S1).
    expect(screen.getByRole("link", { name: /^Set a spend limit\s*, done/ }).getAttribute("href")).toBe(
      `/applications/${application.id}/setup/spend-limit`,
    );
  });

  it("opens the reminder screen from the reminder action, done only once its days are saved", async () => {
    const fetchFn = server([{ status: 200, body: plan("payment_reminder") }, { status: 200, body: plan("payment_reminder") }]);
    const { unmount } = render(<FirstMonthPlan application={application} />);
    // A step ticked here before, with no days saved, is not a reminder.
    expect(await screen.findByText("0 of 3 done")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Set a payment reminder/ })).toBeNull();
    const link = screen.getByRole("link", { name: /^Set a payment reminder/ });
    expect(link.getAttribute("href")).toBe(`/applications/${application.id}/reminders`);
    fireEvent.click(link);
    expect(fetchFn).toHaveBeenCalledOnce();
    unmount();

    render(<FirstMonthPlan application={application} paymentReminderOn />);
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Set a payment reminder\s*, done/ })).toBeTruthy();
  });

  it("saves autopay on the card, as Home does, so a reload and Home agree", async () => {
    const fetchFn = server([
      { status: 200, body: plan() },
      { status: 200, body: { ...application, autopayStatus: "off" } },
      { status: 200, body: { ...application, autopayStatus: "on" } },
    ]);
    render(<FirstMonthPlan application={application} autopayOn />);
    await screen.findByText("1 of 3 done");
    const autopay = screen.getByRole("checkbox", { name: /Turn on autopay/ });

    // Unticking saves autopay as off, not only on the page.
    await waitFor(() => expect(autopay.hasAttribute("disabled")).toBe(false));
    fireEvent.click(autopay);
    expect(screen.getByText("0 of 3 done")).toBeTruthy();
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe(APPLICATION_URL);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({ autopayStatus: "off" });
    // The page's autopay comes from the server render, so it is refreshed.
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());

    // Ticking it again saves it as on.
    await waitFor(() => expect(autopay.hasAttribute("disabled")).toBe(false));
    fireEvent.click(autopay);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchFn.mock.calls[2][1]?.body))).toEqual({ autopayStatus: "on" });
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(2));
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts autopay back and says why when its save fails", async () => {
    server([
      { status: 200, body: plan() },
      { status: 400, body: { error: { code: "invalid_request", message: "The update is invalid." } } },
    ]);
    render(<FirstMonthPlan application={application} autopayOn />);
    await screen.findByText("1 of 3 done");
    const autopay = screen.getByRole("checkbox", { name: /Turn on autopay/ });
    fireEvent.click(autopay);
    expect((await screen.findByRole("alert")).textContent).toContain("The update is invalid.");
    expect(autopay.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("never stays on loading when the load itself throws, and offers to try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadBug.throwOnce = true;
    server([{ status: 200, body: plan("payment_reminder") }]);
    render(<FirstMonthPlan application={application} paymentReminderOn />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("We couldn’t load your saved plan. Your checks won’t be kept.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
  });

  it("sends a student whose session ended to sign in", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<FirstMonthPlan application={application} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
  });

  it("suggests 30% of the card's limit as a monthly spending guide, with its source", async () => {
    server([{ status: 200, body: plan() }]);
    render(<FirstMonthPlan application={application} />);
    await screen.findByText("0 of 3 done");
    const guide = screen.getByText("Up to $150 a month");
    // Hidden from session replay, like the limit on Home.
    expect(guide.className).toContain("ph-sensitive");
    expect(screen.getByText(/30% of your \$500 limit/).className).toContain("ph-sensitive");
    expect(screen.getByText(/30% of your \$500 limit/)).toBeTruthy();
    const source = screen.getByRole("link", { name: /Why 30%\?/ });
    expect(source.getAttribute("href")).toContain("consumerfinance.gov");
  });

  it("shows the 30% rule without dollars, and asks for the limit, when setup skipped it", async () => {
    server([{ status: 200, body: plan() }]);
    render(<FirstMonthPlan application={{ ...application, creditLimitCents: null }} />);
    await screen.findByText("0 of 3 done");
    expect(screen.getByText("Up to 30% of your limit")).toBeTruthy();
    expect(screen.queryByText(/a month$/)).toBeNull();
    expect(screen.getByRole("link", { name: "Add your credit limit on Home" }).getAttribute("href")).toBe("/home");
  });

  it("checks off autopay when the card's autopay is on", async () => {
    server([{ status: 200, body: plan() }]);
    render(<FirstMonthPlan application={application} autopayOn />);
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Turn on autopay/ }).getAttribute("aria-checked")).toBe("true");
  });
});
