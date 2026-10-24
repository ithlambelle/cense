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

const plan = (...steps: string[]) => ({
  applicationId: application.id,
  plan: "first_month",
  completedSteps: steps.map((step) => ({ step, completedAt: "2026-10-16T00:00:00Z" })),
});
const saved = (step: string) => ({ step, completedAt: "2026-10-16T00:00:00Z" });

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
});

describe("FirstMonthPlan", () => {
  it("offers to try again when the plan is briefly unavailable (503)", async () => {
    server([
      { status: 503, body: { error: { code: "data_unavailable", message: "Your data is temporarily unavailable. Please try again." } } },
      { status: 200, body: plan("planned_purchase") },
    ]);
    render(<FirstMonthPlan application={application} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
  });

  it("loads saved steps and lights or puts out each one", async () => {
    const fetchFn = server([
      { status: 200, body: plan("planned_purchase") },
      { status: 201, body: saved("payment_reminder") },
      { status: 204, body: null },
    ]);
    render(<FirstMonthPlan application={application} />);
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe(PLAN_URL);

    fireEvent.click(screen.getByRole("checkbox", { name: /Set a payment reminder/ }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe(`${PLAN_URL}/steps/payment_reminder`);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(screen.getByText("2 of 3 done")).toBeTruthy();

    const purchase = screen.getByRole("checkbox", { name: /Choose one planned purchase/ });
    await waitFor(() => expect(purchase.hasAttribute("disabled")).toBe(false));
    fireEvent.click(purchase);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    expect(fetchFn.mock.calls[2][0]).toBe(`${PLAN_URL}/steps/planned_purchase`);
    expect(fetchFn.mock.calls[2][1]?.method).toBe("DELETE");
    await waitFor(() => expect(screen.getByText("1 of 3 done")).toBeTruthy());
  });

  it("keeps autopay on the page only, since it is not a saved step", async () => {
    const fetchFn = server([{ status: 200, body: plan() }]);
    render(<FirstMonthPlan application={application} />);
    await screen.findByText("0 of 3 done");
    fireEvent.click(screen.getByRole("checkbox", { name: /Turn on autopay/ }));
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("puts a star back out when its save fails, and says why", async () => {
    server([
      { status: 200, body: plan() },
      { status: 500, body: { error: { code: "internal_error", message: "Something broke." } } },
    ]);
    render(<FirstMonthPlan application={application} />);
    await screen.findByText("0 of 3 done");
    const purchase = screen.getByRole("checkbox", { name: /Choose one planned purchase/ });
    fireEvent.click(purchase);
    expect((await screen.findByRole("alert")).textContent).toContain("Something broke.");
    expect(purchase.getAttribute("aria-checked")).toBe("false");
  });

  it("undoes only the step whose save failed, keeping another that saved meanwhile", async () => {
    let failPurchase: (r: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      if (!init?.method || init.method === "GET") return Response.json(plan(), { status: 200 });
      if (String(url).endsWith("planned_purchase")) return new Promise<Response>((resolve) => { failPurchase = resolve; });
      return Response.json(saved("payment_reminder"), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<FirstMonthPlan application={application} />);
    await screen.findByText("0 of 3 done");
    const purchase = screen.getByRole("checkbox", { name: /Choose one planned purchase/ });
    const reminder = screen.getByRole("checkbox", { name: /Set a payment reminder/ });
    fireEvent.click(purchase);
    expect(purchase.hasAttribute("disabled")).toBe(true);
    fireEvent.click(reminder);
    await waitFor(() => expect(reminder.getAttribute("aria-checked")).toBe("true"));
    failPurchase(Response.json({}, { status: 500 }));
    await screen.findByRole("alert");
    expect(purchase.getAttribute("aria-checked")).toBe("false");
    expect(reminder.getAttribute("aria-checked")).toBe("true");
  });

  it("never stays on loading when the load itself throws, and offers to try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadBug.throwOnce = true;
    server([{ status: 200, body: plan("planned_purchase") }]);
    render(<FirstMonthPlan application={application} />);
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
});
