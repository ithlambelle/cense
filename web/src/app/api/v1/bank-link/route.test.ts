import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

const config = vi.hoisted(() => ({ plaidConfig: vi.fn() }));
vi.mock("@/lib/plaid/config", () => config);

const plaid = vi.hoisted(() => ({ exchangePublicToken: vi.fn(), getAccounts: vi.fn(), removeItem: vi.fn() }));
vi.mock("@/lib/plaid/client", async (importOriginal) => ({ ...(await importOriginal<object>()), ...plaid }));

const store = vi.hoisted(() => ({
  linkStatus: vi.fn(),
  readAccessTokens: vi.fn(),
  saveBankLink: vi.fn(),
  saveBalances: vi.fn(),
  deleteBankLink: vi.fn(),
  disconnectBankLink: vi.fn(),
  loadSafeToSpend: vi.fn(),
}));
vi.mock("@/lib/plaid/store", () => store);

const transactions = vi.hoisted(() => ({ syncStudentTransactions: vi.fn() }));
vi.mock("@/lib/plaid/transactions", () => transactions);

import { DELETE, POST } from "./route";

const CONFIG = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", environment: "sandbox" as const, tokenKey: Buffer.alloc(32) };
const SAFE_TO_SPEND = { institutionName: "First Platypus Bank", dailyCents: 633 };
const ACCOUNTS = {
  ok: true,
  data: {
    accounts: [{ account_id: "a", balances: { available: 100, current: 110, iso_currency_code: "USD" }, mask: "0000", name: "Plaid Checking", type: "depository", subtype: "checking" }],
    item: { institution_name: "First Platypus Bank" },
  },
};

const post = (body: unknown) => POST(new Request("http://test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  auth.authenticatedStudent.mockResolvedValue({ supabase: {}, studentId: "student-1", email: null });
  config.plaidConfig.mockReturnValue(CONFIG);
  store.linkStatus.mockResolvedValue({ ok: true, value: null });
  plaid.exchangePublicToken.mockResolvedValue({ ok: true, data: { access_token: "access-sandbox-new", item_id: "item-new" } });
  plaid.getAccounts.mockResolvedValue(ACCOUNTS);
  plaid.removeItem.mockResolvedValue({ ok: true, data: {} });
  store.saveBankLink.mockResolvedValue({ ok: true, value: "saved" });
  store.saveBalances.mockResolvedValue({ ok: true, value: true });
  store.loadSafeToSpend.mockResolvedValue({ ok: true, value: SAFE_TO_SPEND });
  transactions.syncStudentTransactions.mockResolvedValue({ kind: "synced", saved: 0, removed: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const group of [auth, config, plaid, store, transactions]) for (const fn of Object.values(group)) fn.mockReset();
});

describe("POST /bank-link", () => {
  it("exchanges on the server, saves the sealed link and the balances, and never answers with the token", async () => {
    const response = await post({ publicToken: "public-sandbox-good" });
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toContain("access-sandbox-new");
    expect(JSON.parse(text)).toEqual(SAFE_TO_SPEND);
    expect(store.saveBankLink).toHaveBeenCalledWith(expect.anything(), CONFIG, {
      itemId: "item-new",
      accessToken: "access-sandbox-new",
      institutionName: "First Platypus Bank",
    });
    expect(store.saveBalances).toHaveBeenCalledWith(expect.anything(), [
      { name: "Plaid Checking", mask: "0000", kind: "cash", balanceCents: 10_000 },
    ]);
    // Transactions are pulled right after linking, for Your money's This month.
    expect(transactions.syncStudentTransactions).toHaveBeenCalledWith(expect.anything(), CONFIG, { itemId: "item-new", accessToken: "access-sandbox-new" });
  });

  it("keeps the link when the first transactions sync fails", async () => {
    transactions.syncStudentTransactions.mockResolvedValue({ kind: "plaid", failure: { ok: false, kind: "plaid", code: "PRODUCT_NOT_READY" } });
    const response = await post({ publicToken: "public-sandbox-good" });
    expect(response.status).toBe(201);
    expect(console.error).toHaveBeenCalledWith(JSON.stringify({ event: "plaid_transactions_sync_failed", kind: "plaid" }));
  });

  it("needs a session, then Plaid settings, then a public token", async () => {
    auth.authenticatedStudent.mockResolvedValueOnce(null);
    expect((await post({ publicToken: "x" })).status).toBe(401);
    config.plaidConfig.mockReturnValueOnce(null);
    expect((await post({ publicToken: "x" })).status).toBe(503);
    for (const body of [{}, { publicToken: "" }, { publicToken: "x", extra: 1 }, "x"]) expect((await post(body)).status).toBe(400);
    expect(plaid.exchangePublicToken).not.toHaveBeenCalled();
  });

  it("refuses a second bank before Plaid makes another Item", async () => {
    store.linkStatus.mockResolvedValue({ ok: true, value: "active" });
    const response = await post({ publicToken: "public-sandbox-good" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("already_linked");
    expect(plaid.exchangePublicToken).not.toHaveBeenCalled();
  });

  it("says an expired public token expired", async () => {
    plaid.exchangePublicToken.mockResolvedValue({ ok: false, kind: "plaid", code: "INVALID_PUBLIC_TOKEN" });
    const response = await post({ publicToken: "public-sandbox-old" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "link_expired", message: "That connection expired. Please connect again." });
  });

  it("removes the new Item at Plaid when a second Link won the race", async () => {
    store.saveBankLink.mockResolvedValue({ ok: true, value: "conflict" });
    expect((await post({ publicToken: "public-sandbox-good" })).status).toBe(409);
    expect(plaid.removeItem).toHaveBeenCalledWith(CONFIG, "access-sandbox-new");
    expect(store.saveBalances).not.toHaveBeenCalled();
  });

  it("removes the new Item at Plaid when the link cannot be saved", async () => {
    store.saveBankLink.mockResolvedValue({ ok: false, error: { code: "08006", message: "down" } });
    expect((await post({ publicToken: "public-sandbox-good" })).status).toBe(503);
    expect(plaid.removeItem).toHaveBeenCalledWith(CONFIG, "access-sandbox-new");
  });

  it("keeps the link when the first balance read fails, under a plain bank name", async () => {
    plaid.getAccounts.mockResolvedValue({ ok: false, kind: "plaid", code: "PRODUCT_NOT_READY" });
    expect((await post({ publicToken: "public-sandbox-good" })).status).toBe(201);
    expect(store.saveBankLink.mock.calls[0][2].institutionName).toBe("Your bank");
    expect(store.saveBalances).not.toHaveBeenCalled();
  });
});

describe("DELETE /bank-link", () => {
  const ITEM = { kind: "token", itemId: "item-1", accessToken: "access-sandbox-1" };
  beforeEach(() => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [ITEM] });
    store.disconnectBankLink.mockResolvedValue({ ok: true, value: true });
    store.deleteBankLink.mockResolvedValue({ ok: true, value: true });
  });

  it("removes the Item at Plaid, then deletes everything, queueing nothing", async () => {
    const response = await DELETE();
    expect(response.status).toBe(204);
    expect(plaid.removeItem).toHaveBeenCalledWith(CONFIG, "access-sandbox-1");
    expect(plaid.removeItem.mock.invocationCallOrder[0]).toBeLessThan(store.disconnectBankLink.mock.invocationCallOrder[0]);
    expect(store.disconnectBankLink).toHaveBeenCalledWith(expect.anything(), ["item-1"]);
  });

  // Figma E3 (Ben, Nov 18): deletion is never blocked by Plaid.
  it("Plaid down: answers 204, deletes our copy and queues the Item for the daily cleanup", async () => {
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "network" });
    const response = await DELETE();
    expect(response.status).toBe(204);
    expect(store.disconnectBankLink).toHaveBeenCalledWith(expect.anything(), []);
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  it("still deletes, without queueing, when Plaid says the Item is already gone", async () => {
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "plaid", code: "ITEM_NOT_FOUND" });
    expect((await DELETE()).status).toBe(204);
    expect(store.disconnectBankLink).toHaveBeenCalledWith(expect.anything(), ["item-1"]);
  });

  it("deletes the local copy of a token that cannot be opened, without queueing it", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [{ kind: "unreadable", itemId: "item-1" }] });
    expect((await DELETE()).status).toBe(204);
    expect(plaid.removeItem).not.toHaveBeenCalled();
    expect(store.disconnectBankLink).toHaveBeenCalledWith(expect.anything(), ["item-1"]);
  });

  it("mixed: queues only the Item Plaid could not remove", async () => {
    store.readAccessTokens.mockResolvedValue({
      ok: true,
      value: [ITEM, { kind: "token", itemId: "item-2", accessToken: "access-sandbox-2" }, { kind: "token", itemId: "item-3", accessToken: "access-sandbox-3" }],
    });
    plaid.removeItem.mockImplementation(async (_config: unknown, accessToken: string) =>
      accessToken === "access-sandbox-2" ? { ok: false, kind: "network" } : accessToken === "access-sandbox-3" ? { ok: false, kind: "plaid", code: "INVALID_ACCESS_TOKEN" } : { ok: true, data: {} },
    );
    expect((await DELETE()).status).toBe(204);
    expect(store.disconnectBankLink).toHaveBeenCalledWith(expect.anything(), ["item-1", "item-3"]);
  });

  it("before the migration (no disconnect_bank_link), Plaid down still changes nothing and answers 502", async () => {
    store.disconnectBankLink.mockResolvedValue({ ok: false, error: { code: "PGRST202", message: "no such function" } });
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "network" });
    const response = await DELETE();
    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toContain("Nothing changed");
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  it("before the migration, a removed Item is deleted with delete_bank_link as before", async () => {
    store.disconnectBankLink.mockResolvedValue({ ok: false, error: { code: "42883", message: "function does not exist" } });
    expect((await DELETE()).status).toBe(204);
    expect(store.deleteBankLink).toHaveBeenCalled();
  });

  it("answers 429 with nothing changed when 3 Items already wait for removal at Plaid", async () => {
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "network" });
    store.disconnectBankLink.mockResolvedValue({ ok: false, error: { code: "54000", message: "too many bank removals waiting" } });
    const response = await DELETE();
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe("disconnect_limit");
    expect(body.error.message).toContain("Nothing changed");
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  it("answers 503 when the delete fails in the database", async () => {
    store.disconnectBankLink.mockResolvedValue({ ok: false, error: { code: "08006", message: "down" } });
    expect((await DELETE()).status).toBe(503);
  });

  it("answers 404 with no bank, and 401 signed out", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [] });
    expect((await DELETE()).status).toBe(404);
    auth.authenticatedStudent.mockResolvedValueOnce(null);
    expect((await DELETE()).status).toBe(401);
  });
});

// Created with Claude Code (2026-11-25). The production pilot
// (lib/plaid/pilot.ts runs for real against these database answers).
describe("POST /bank-link in production", () => {
  const PRODUCTION = { ...CONFIG, baseUrl: "https://production.plaid.com", environment: "production" as const };
  const rpc = vi.fn();
  const pilot = (answers: { access?: string; claim?: boolean }) =>
    rpc.mockImplementation(async (name: string) => {
      if (name === "plaid_pilot_access") return { data: answers.access ?? "open", error: null };
      if (name === "claim_plaid_item_slot") return { data: answers.claim ?? true, error: null };
      return { data: null, error: { message: `unexpected ${name}` } };
    });

  beforeEach(() => {
    config.plaidConfig.mockReturnValue(PRODUCTION);
    auth.authenticatedStudent.mockResolvedValue({ supabase: { rpc }, studentId: "student-1", email: null });
  });
  afterEach(() => rpc.mockReset());

  it("links a pilot student's bank after taking a slot, before the exchange", async () => {
    pilot({ access: "open", claim: true });
    const response = await post({ publicToken: "public-production-1" });
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("claim_plaid_item_slot");
    expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(plaid.exchangePublicToken.mock.invocationCallOrder[0]);
    expect(plaid.exchangePublicToken).toHaveBeenCalledWith(PRODUCTION, "public-production-1");
  });

  it("refuses a student outside the pilot without taking a slot or calling Plaid", async () => {
    pilot({ access: "none" });
    const response = await post({ publicToken: "public-production-1" });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("pilot_only");
    expect(rpc).not.toHaveBeenCalledWith("claim_plaid_item_slot");
    expect(plaid.exchangePublicToken).not.toHaveBeenCalled();
  });

  it("refuses when no slot is left, and never exchanges the public token", async () => {
    pilot({ access: "open", claim: false });
    const response = await post({ publicToken: "public-production-1" });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("bank_link_full");
    expect(plaid.exchangePublicToken).not.toHaveBeenCalled();
  });

  it("refuses a second bank before taking a slot", async () => {
    pilot({ access: "open" });
    store.linkStatus.mockResolvedValue({ ok: true, value: "active" });
    const response = await post({ publicToken: "public-production-1" });
    expect(response.status).toBe(409);
    expect(rpc).not.toHaveBeenCalledWith("claim_plaid_item_slot");
  });

  it("keeps the slot taken when the exchange fails (Plaid may still count it)", async () => {
    pilot({ access: "open", claim: true });
    plaid.exchangePublicToken.mockResolvedValue({ ok: false, kind: "network" });
    const response = await post({ publicToken: "public-production-1" });
    expect(response.status).toBe(502);
    expect(rpc).toHaveBeenCalledWith("claim_plaid_item_slot");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("refuses when the pilot cannot be read, before Plaid is called", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    const response = await post({ publicToken: "public-production-1" });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("data_unavailable");
    expect(plaid.exchangePublicToken).not.toHaveBeenCalled();
  });

  it("never asks the pilot in the sandbox", async () => {
    config.plaidConfig.mockReturnValue(CONFIG);
    const response = await post({ publicToken: "public-sandbox-1" });
    expect(response.status).toBe(201);
    expect(rpc).not.toHaveBeenCalled();
  });
});
