// Created with Claude Code (2026-11-14). Saving the student's own number for
// one line of This month, and going back to the bank's (US-12).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

const config = vi.hoisted(() => ({ plaidConfig: vi.fn() }));
vi.mock("@/lib/plaid/config", () => config);

const plaidStore = vi.hoisted(() => ({ loadSafeToSpend: vi.fn() }));
vi.mock("@/lib/plaid/store", () => plaidStore);

const store = vi.hoisted(() => ({ loadBudget: vi.fn(), saveBudgetLine: vi.fn(), deleteBudgetLine: vi.fn() }));
vi.mock("@/lib/budget/store", () => store);

import { DELETE, PUT } from "./route";

const STUDENT = { supabase: {}, studentId: "student-1", email: null };
const BUDGET = { month: "2026-10-01", remainingCents: 78000 };
const params = (line: string) => ({ params: Promise.resolve({ line }) });
const put = (body: unknown) => new Request("http://test", { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const del = () => new Request("http://test", { method: "DELETE" });

beforeEach(() => {
  auth.authenticatedStudent.mockResolvedValue(STUDENT);
  config.plaidConfig.mockReturnValue({ clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) });
  plaidStore.loadSafeToSpend.mockResolvedValue({ ok: true, value: { setAsideCents: 10000 } });
  store.loadBudget.mockResolvedValue({ ok: true, value: BUDGET });
  store.saveBudgetLine.mockResolvedValue({ ok: true, value: true });
  store.deleteBudgetLine.mockResolvedValue({ ok: true, value: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const group of [auth, config, plaidStore, store]) for (const fn of Object.values(group)) fn.mockReset();
});

describe("PUT /budget/lines/{line}", () => {
  it("saves the student's number and answers the budget with it", async () => {
    const response = await PUT(put({ amountCents: 25000 }), params("groceries"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(BUDGET);
    expect(store.saveBudgetLine).toHaveBeenCalledWith(STUDENT, "groceries", 25000);
    expect(store.loadBudget).toHaveBeenCalledWith(STUDENT, { setAsideCents: 10000 });
  });

  it("refuses an unknown line, and the saving line, which is the safe-to-spend answer", async () => {
    for (const line of ["rent", "saving"]) {
      const response = await PUT(put({ amountCents: 1 }), params(line));
      expect(response.status).toBe(400);
    }
    expect(store.saveBudgetLine).not.toHaveBeenCalled();
  });

  it("answers 404 not_linked without a bank", async () => {
    store.saveBudgetLine.mockResolvedValue({ ok: true, value: false });
    const response = await PUT(put({ amountCents: 1 }), params("income"));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_linked");
  });
});

describe("DELETE /budget/lines/{line}", () => {
  it("deletes the student's number and answers the budget on the bank's", async () => {
    const response = await DELETE(del(), params("groceries"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(BUDGET);
    expect(store.deleteBudgetLine).toHaveBeenCalledWith(STUDENT, "groceries");
    expect(store.loadBudget).toHaveBeenCalledWith(STUDENT, { setAsideCents: 10000 });
  });

  it("answers 401 signed out, and deletes nothing", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    const response = await DELETE(del(), params("groceries"));
    expect(response.status).toBe(401);
    expect(store.deleteBudgetLine).not.toHaveBeenCalled();
  });

  it("is off where safe to spend is off", async () => {
    config.plaidConfig.mockReturnValue(null);
    const response = await DELETE(del(), params("groceries"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("safe_to_spend_unavailable");
    expect(store.deleteBudgetLine).not.toHaveBeenCalled();
  });

  it("refuses an unknown line, and the saving line", async () => {
    for (const line of ["rent", "saving"]) {
      const response = await DELETE(del(), params(line));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_request");
    }
    expect(store.deleteBudgetLine).not.toHaveBeenCalled();
  });

  it("answers 404 not_linked without a bank, and deletes nothing", async () => {
    plaidStore.loadSafeToSpend.mockResolvedValue({ ok: true, value: null });
    const response = await DELETE(del(), params("income"));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_linked");
    expect(store.deleteBudgetLine).not.toHaveBeenCalled();
  });

  it("answers 503 when the delete fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.deleteBudgetLine.mockResolvedValue({ ok: false, error: { code: "XX000", message: "down" } });
    const response = await DELETE(del(), params("income"));
    expect(response.status).toBe(503);
    expect(store.loadBudget).not.toHaveBeenCalled();
  });
});
