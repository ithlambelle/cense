// Created with Claude Code (2026-11-25). POST /bank-link/findings, Penny
// reading the bank: answers the questions from the bank only when its history
// is long enough to mean something, never replaces answers, and shows last
// month only when the history covers it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);
const config = vi.hoisted(() => ({ plaidConfig: vi.fn() }));
vi.mock("@/lib/plaid/config", () => config);
const store = vi.hoisted(() => ({ loadSafeToSpend: vi.fn(), recentTransactions: vi.fn(), saveAnswers: vi.fn() }));
vi.mock("@/lib/plaid/store", () => store);
const budget = vi.hoisted(() => ({ loadBudget: vi.fn() }));
vi.mock("@/lib/budget/store", () => budget);

import { POST } from "./route";

const STUDENT = { studentId: "student-1", email: null, supabase: {} };
const LINK = (answered: boolean) => ({ institutionName: "First Platypus Bank", answered, bills: [], setAsideCents: 0, status: "active" });
const BUDGET = { month: "2026-10-01", hasBankData: true };
const row = (posted_on: string, amount_cents: number, category_detailed: string, merchant_name: string | null = null) => ({
  transaction_id: `t-${posted_on}-${amount_cents}`,
  account_id: "acc",
  posted_on,
  amount_cents,
  pending: false,
  category: category_detailed.split("_")[0],
  category_detailed,
  merchant_name,
  description: null,
  payment_app: null,
});
// Rent each month from October 1: more than three weeks of history.
const HISTORY = [row("2026-10-01", 65_000, "RENT_AND_UTILITIES_RENT"), row("2026-11-01", 65_000, "RENT_AND_UTILITIES_RENT")];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T17:00:00Z"));
  auth.authenticatedStudent.mockResolvedValue(STUDENT);
  config.plaidConfig.mockReturnValue({ environment: "sandbox" });
  store.loadSafeToSpend.mockResolvedValue({ ok: true, value: LINK(false) });
  store.saveAnswers.mockResolvedValue({ ok: true, value: true });
  budget.loadBudget.mockResolvedValue({ ok: true, value: BUDGET });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function body() {
  const response = await POST();
  return { status: response.status, json: await response.json() };
}

describe("POST /bank-link/findings", () => {
  it("answers the questions from a bank with enough history, and shows a last month it covers", async () => {
    store.loadSafeToSpend.mockResolvedValueOnce({ ok: true, value: LINK(false) }).mockResolvedValueOnce({ ok: true, value: LINK(true) });
    store.recentTransactions.mockResolvedValue({ ok: true, value: HISTORY });
    const { status, json } = await body();
    expect(status).toBe(200);
    expect(store.saveAnswers).toHaveBeenCalledTimes(1);
    const saved = store.saveAnswers.mock.calls[0][1].bills;
    expect(saved.find((b: { bill: string }) => b.bill === "rent")).toMatchObject({ coveredBy: "me", monthlyCents: 65_000, dueDay: 1 });
    expect(json).toMatchObject({ answeredFromBank: true, enoughHistory: true, lastMonth: BUDGET });
  });

  it("saves nothing and sends no findings when the bank has sent nothing yet, so rent is never answered 'none'", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.recentTransactions.mockResolvedValue({ ok: true, value: [] });
    const { status, json } = await body();
    expect(status).toBe(200);
    expect(store.saveAnswers).not.toHaveBeenCalled();
    expect(json).toMatchObject({ findings: [], answeredFromBank: false, enoughHistory: false, lastMonth: null });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("bank_findings_thin_history"));
  });

  it("saves nothing from a history of under three weeks", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    store.recentTransactions.mockResolvedValue({ ok: true, value: [row("2026-11-10", 4_000, "FOOD_AND_DRINK_GROCERIES", "Star Market")] });
    const { json } = await body();
    expect(store.saveAnswers).not.toHaveBeenCalled();
    expect(json.enoughHistory).toBe(false);
  });

  it("never replaces a student's answers, and still shows what it found", async () => {
    store.loadSafeToSpend.mockResolvedValue({ ok: true, value: LINK(true) });
    store.recentTransactions.mockResolvedValue({ ok: true, value: HISTORY });
    const { json } = await body();
    expect(store.saveAnswers).not.toHaveBeenCalled();
    expect(json.answeredFromBank).toBe(false);
    expect(json.findings.find((f: { kind: string }) => f.kind === "rent")).toMatchObject({ found: true });
  });

  it("never lists a bill the student said they pay as not in their bank", async () => {
    const answers = [
      { bill: "rent", coveredBy: "me", monthlyCents: 65_000, dueDay: 1 },
      { bill: "phone", coveredBy: "me", monthlyCents: 4_500, dueDay: 15 },
      { bill: "tuition", coveredBy: "none", monthlyCents: null, dueDay: null },
      { bill: "groceries", coveredBy: "none", monthlyCents: null, dueDay: null },
      { bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null },
    ];
    store.loadSafeToSpend.mockResolvedValue({ ok: true, value: { ...LINK(true), bills: answers } });
    store.recentTransactions.mockResolvedValue({ ok: true, value: HISTORY });
    const { json } = await body();
    const missing = json.findings.filter((f: { found: boolean }) => !f.found).map((f: { kind: string }) => f.kind);
    expect(missing).not.toContain("phone");
    expect(missing).toEqual(expect.arrayContaining(["tuition", "groceries", "car"]));
  });

  it("leaves last month out when the history starts after its first week", async () => {
    store.recentTransactions.mockResolvedValue({ ok: true, value: [row("2026-10-20", 65_000, "RENT_AND_UTILITIES_RENT"), row("2026-11-01", 65_000, "RENT_AND_UTILITIES_RENT")] });
    const { json } = await body();
    expect(json.enoughHistory).toBe(true);
    expect(json.lastMonth).toBeNull();
  });

  it("leaves last month out, and still answers, when it cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.recentTransactions.mockResolvedValue({ ok: true, value: HISTORY });
    budget.loadBudget.mockResolvedValue({ ok: false, error: { code: "08006" } });
    const { status, json } = await body();
    expect(status).toBe(200);
    expect(json.lastMonth).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("bank_findings_budget_read_failed"));
  });

  it("needs a session and a linked bank", async () => {
    auth.authenticatedStudent.mockResolvedValueOnce(null);
    expect((await POST()).status).toBe(401);
    store.loadSafeToSpend.mockResolvedValue({ ok: true, value: null });
    const { status, json } = await body();
    expect(status).toBe(404);
    expect(json.code ?? json.error?.code).toBe("not_linked");
  });
});
