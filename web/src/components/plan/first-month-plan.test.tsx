// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/home/state";

import { FirstMonthPlan } from "./first-month-plan";

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

afterEach(() => vi.unstubAllGlobals());

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
});

