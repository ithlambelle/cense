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
  readAccessToken: vi.fn(),
  saveBankLink: vi.fn(),
  saveBalances: vi.fn(),
  deleteBankLink: vi.fn(),
  loadSafeToSpend: vi.fn(),
}));
vi.mock("@/lib/plaid/store", () => store);

import { DELETE, POST } from "./route";

const CONFIG = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) };
const SAFE_TO_SPEND = { institutionName: "First Platypus Bank", dailyCents: 633 };
const ACCOUNTS = {
  ok: true,
  data: {
    accounts: [{ account_id: "a", balances: { available: 100, current: 110, iso_currency_code: "USD" }, mask: "0000", name: "Plaid Checking", type: "depository", subtype: "checking" }],
    item: { institution_name: "First Platypus Bank" },
  },
};

const post = (body: unknown) => POST(new Request("http://test", { method: "POST", body: JSON.stringify(body) }));

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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const group of [auth, config, plaid, store]) for (const fn of Object.values(group)) fn.mockReset();
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
  it("removes the Item at Plaid, then deletes everything", async () => {
    store.readAccessToken.mockResolvedValue({ ok: true, value: { kind: "token", itemId: "item-1", accessToken: "access-sandbox-1" } });
    store.deleteBankLink.mockResolvedValue({ ok: true, value: true });
    const response = await DELETE();
    expect(response.status).toBe(204);
    expect(plaid.removeItem).toHaveBeenCalledWith(CONFIG, "access-sandbox-1");
    expect(plaid.removeItem.mock.invocationCallOrder[0]).toBeLessThan(store.deleteBankLink.mock.invocationCallOrder[0]);
  });

  it("changes nothing when Plaid cannot remove the Item, so the token is never lost", async () => {
    store.readAccessToken.mockResolvedValue({ ok: true, value: { kind: "token", itemId: "item-1", accessToken: "access-sandbox-1" } });
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "network" });
    const response = await DELETE();
    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toContain("Nothing changed");
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  it("still deletes when Plaid says the Item is already gone", async () => {
    store.readAccessToken.mockResolvedValue({ ok: true, value: { kind: "token", itemId: "item-1", accessToken: "access-sandbox-1" } });
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "plaid", code: "ITEM_NOT_FOUND" });
    store.deleteBankLink.mockResolvedValue({ ok: true, value: true });
    expect((await DELETE()).status).toBe(204);
  });

  it("deletes the local copy of a token that cannot be opened", async () => {
    store.readAccessToken.mockResolvedValue({ ok: true, value: { kind: "unreadable", itemId: "item-1" } });
    store.deleteBankLink.mockResolvedValue({ ok: true, value: true });
    expect((await DELETE()).status).toBe(204);
    expect(plaid.removeItem).not.toHaveBeenCalled();
  });

  it("answers 404 with no bank, and 401 signed out", async () => {
    store.readAccessToken.mockResolvedValue({ ok: true, value: { kind: "none" } });
    expect((await DELETE()).status).toBe(404);
    auth.authenticatedStudent.mockResolvedValueOnce(null);
    expect((await DELETE()).status).toBe(401);
  });
});
