import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

const config = vi.hoisted(() => ({ plaidConfig: vi.fn() }));
vi.mock("@/lib/plaid/config", () => config);

const plaid = vi.hoisted(() => ({ getAccounts: vi.fn() }));
vi.mock("@/lib/plaid/client", async (importOriginal) => ({ ...(await importOriginal<object>()), ...plaid }));

const store = vi.hoisted(() => ({ readAccessToken: vi.fn(), saveBalances: vi.fn(), markLinkStatus: vi.fn(), loadSafeToSpend: vi.fn() }));
vi.mock("@/lib/plaid/store", () => store);

const transactions = vi.hoisted(() => ({ syncStudentTransactions: vi.fn() }));
vi.mock("@/lib/plaid/transactions", () => transactions);

const liabilities = vi.hoisted(() => ({ fillCardDueDays: vi.fn() }));
vi.mock("@/lib/plaid/liabilities", () => liabilities);

import { POST } from "./route";

const TOKEN = { ok: true, value: { kind: "token", itemId: "item-1", accessToken: "access-sandbox-1" } };

beforeEach(() => {
  auth.authenticatedStudent.mockResolvedValue({ supabase: {}, studentId: "student-1", email: null });
  config.plaidConfig.mockReturnValue({ clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) });
  store.readAccessToken.mockResolvedValue(TOKEN);
  store.saveBalances.mockResolvedValue({ ok: true, value: true });
  store.markLinkStatus.mockResolvedValue({ ok: true, value: null });
  store.loadSafeToSpend.mockResolvedValue({ ok: true, value: { dailyCents: 633 } });
  plaid.getAccounts.mockResolvedValue({ ok: true, data: { accounts: [], item: {} } });
  transactions.syncStudentTransactions.mockResolvedValue({ kind: "synced", saved: 0, removed: 0 });
  liabilities.fillCardDueDays.mockResolvedValue({ kind: "skipped", reason: "not_one_card" });
});

afterEach(() => {
  for (const group of [auth, config, plaid, store, transactions, liabilities]) for (const fn of Object.values(group)) fn.mockReset();
});

describe("POST /bank-link/refresh", () => {
  it("brings transactions up to date after the balances, and still answers when that fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    transactions.syncStudentTransactions.mockResolvedValue({ kind: "plaid", failure: { ok: false, kind: "network" } });
    const response = await POST();
    expect(response.status).toBe(200);
    expect(transactions.syncStudentTransactions).toHaveBeenCalledWith(expect.anything(), expect.anything(), { itemId: "item-1", accessToken: "access-sandbox-1" });
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: "plaid_transactions_sync_failed", kind: "plaid" }));
  });

  it("fills in the card's dates from the bank, and still answers when that fails, logging only the kind and code", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST()).status).toBe(200);
    expect(liabilities.fillCardDueDays).toHaveBeenCalledWith(expect.anything(), expect.anything(), "access-sandbox-1");
    expect(logged).not.toHaveBeenCalled();

    liabilities.fillCardDueDays.mockResolvedValue({ kind: "plaid", code: "INTERNAL_SERVER_ERROR" });
    expect((await POST()).status).toBe(200);
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: "plaid_card_dates_failed", kind: "plaid", code: "INTERNAL_SERVER_ERROR" }));
  });

  it("saves the balances read again and answers safe to spend", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dailyCents: 633 });
    expect(store.saveBalances).toHaveBeenCalled();
  });

  it("marks the bank as needing a new sign-in when Plaid says so", async () => {
    plaid.getAccounts.mockResolvedValue({ ok: false, kind: "plaid", code: "ITEM_LOGIN_REQUIRED" });
    const response = await POST();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("reconnect_needed");
    expect(store.markLinkStatus).toHaveBeenCalledWith(expect.anything(), "reconnect_needed");
    expect(store.saveBalances).not.toHaveBeenCalled();
  });

  it("saves that the link must be made again when the Item is gone at Plaid or the token cannot be opened", async () => {
    plaid.getAccounts.mockResolvedValue({ ok: false, kind: "plaid", code: "INVALID_ACCESS_TOKEN" });
    expect((await (await POST()).json()).error.code).toBe("relink_needed");
    store.readAccessToken.mockResolvedValue({ ok: true, value: { kind: "unreadable", itemId: "item-1" } });
    expect((await (await POST()).json()).error.code).toBe("relink_needed");
    expect(store.markLinkStatus.mock.calls.map((call) => call[1])).toEqual(["relink_needed", "relink_needed"]);
    expect(store.saveBalances).not.toHaveBeenCalled();
  });

  it("keeps the old numbers when the bank is down", async () => {
    plaid.getAccounts.mockResolvedValue({ ok: false, kind: "plaid", code: "INSTITUTION_DOWN" });
    expect((await POST()).status).toBe(502);
    expect(store.saveBalances).not.toHaveBeenCalled();
  });

  it("answers 404 when there is no bank, or it was disconnected meanwhile", async () => {
    store.readAccessToken.mockResolvedValueOnce({ ok: true, value: { kind: "none" } });
    expect((await POST()).status).toBe(404);
    store.saveBalances.mockResolvedValueOnce({ ok: true, value: false });
    expect((await POST()).status).toBe(404);
  });
});
