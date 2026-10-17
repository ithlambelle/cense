// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/home/state";

import { FirstMonthPlan } from "./first-month-plan";

// Lets a test make the next request throw, as a bug in this app would.
const loadBug = vi.hoisted(() => ({ throwOnce: false }));
vi.mock("@/lib/api-client/pending", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client/pending")>();
  return {
    ...actual,
    pendingRequest: ((...args: Parameters<typeof actual.pendingRequest>) => {
      if (loadBug.throwOnce) {
        loadBug.throwOnce = false;
        return Promise.reject(new Error("bug"));
      }
      return actual.pendingRequest(...args);
    }) as typeof actual.pendingRequest,
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

const plan = (actions: Record<string, boolean>) => ({
  applicationId: application.id,
  actions: { autopay: false, plannedPurchase: false, paymentReminder: false, ...actions },
  updatedAt: "2026-10-16T00:00:00Z",
});

function server(replies: { status: number; body: unknown }[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return Response.json(reply.body, { status: reply.status });
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
  it("says checks are not kept while saving the plan is not built yet", async () => {
    server([{ status: 404, body: {} }]);
    render(<FirstMonthPlan application={application} />);
    expect((await screen.findByRole("status")).textContent).toContain("isn’t available yet");
    const autopay = screen.getByRole("checkbox", { name: /Turn on autopay/ });
    fireEvent.click(autopay);
    expect(autopay.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
  });

  it("loads saved progress and saves each change", async () => {
    const fetchFn = server([
      { status: 200, body: plan({ autopay: true }) },
      { status: 200, body: plan({ autopay: true, paymentReminder: true }) },
    ]);
    render(<FirstMonthPlan application={application} />);
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Set a payment reminder/ }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({ actions: { paymentReminder: true } });
    expect(screen.getByText("2 of 3 done")).toBeTruthy();
  });

  it("undoes a check that could not be saved and says why", async () => {
    server([
      { status: 200, body: plan({}) },
      { status: 500, body: {} },
    ]);
    render(<FirstMonthPlan application={application} />);
    await screen.findByText("0 of 3 done");
    const autopay = screen.getByRole("checkbox", { name: /Turn on autopay/ });
    fireEvent.click(autopay);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(autopay.getAttribute("aria-checked")).toBe("false");
  });

  it("undoes only the action whose save failed, keeping another that saved meanwhile", async () => {
    let failAutopay: (r: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      if (!init?.method || init.method === "GET") return Response.json(plan({}), { status: 200 });
      const body = JSON.parse(String(init.body));
      if ("autopay" in body.actions) return new Promise<Response>((resolve) => { failAutopay = resolve; });
      return Response.json(plan({ plannedPurchase: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<FirstMonthPlan application={application} />);
    await screen.findByText("0 of 3 done");
    const autopay = screen.getByRole("checkbox", { name: /Turn on autopay/ });
    const purchase = screen.getByRole("checkbox", { name: /Choose one planned purchase/ });
    fireEvent.click(autopay);
    expect(autopay.hasAttribute("disabled")).toBe(true);
    fireEvent.click(purchase);
    await waitFor(() => expect(purchase.getAttribute("aria-checked")).toBe("true"));
    failAutopay(Response.json({}, { status: 500 }));
    await screen.findByRole("alert");
    expect(autopay.getAttribute("aria-checked")).toBe("false");
    expect(purchase.getAttribute("aria-checked")).toBe("true");
  });

  it("never stays on loading when the load itself throws, and offers to try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadBug.throwOnce = true;
    server([{ status: 200, body: plan({ autopay: true }) }]);
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
