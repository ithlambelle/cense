import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const plaid = vi.hoisted(() => ({ removeItem: vi.fn() }));
vi.mock("@/lib/plaid/client", async (importOriginal) => ({ ...(await importOriginal<object>()), ...plaid }));

const store = vi.hoisted(() => ({ readAccessTokens: vi.fn(), deleteBankLink: vi.fn(), disconnectBankLink: vi.fn() }));
vi.mock("@/lib/plaid/store", () => store);

import type { Student } from "@/lib/api/auth";

import type { PlaidConfig } from "./config";
import type { TokenKey } from "./token-box";
import { removeBankLinksForStudent } from "./unlink";

const STUDENT = { supabase: {}, studentId: "student-1", email: null } as unknown as Student;
const CONFIG: PlaidConfig = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) as TokenKey };
const token = (n: number) => ({ kind: "token", itemId: `item-${n}`, accessToken: `access-${n}` });
const PLAID_DOWN = { ok: false, kind: "network" };
const ALREADY_GONE = { ok: false, kind: "plaid", code: "ITEM_NOT_FOUND" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  plaid.removeItem.mockResolvedValue({ ok: true, data: {} });
  store.disconnectBankLink.mockResolvedValue({ ok: true, value: true });
  store.deleteBankLink.mockResolvedValue({ ok: true, value: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  plaid.removeItem.mockReset();
  for (const fn of Object.values(store)) fn.mockReset();
});

const logged = () => vi.mocked(console.error).mock.calls.map((call) => call[0]);

// What Disconnect uses (Figma E3): Plaid is asked to remove every Item, then
// our copy is always deleted, and whatever Plaid did not remove is queued.
describe("removeBankLinksForStudent", () => {
  it("removes every Item at Plaid, then deletes the token, balances and answers, queueing nothing", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1), token(2)] });
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "removed" });
    expect(plaid.removeItem.mock.calls.map((call) => call[1])).toEqual(["access-1", "access-2"]);
    expect(plaid.removeItem.mock.invocationCallOrder.at(-1)).toBeLessThan(store.disconnectBankLink.mock.invocationCallOrder[0]);
    expect(store.disconnectBankLink).toHaveBeenCalledWith(STUDENT, []);
    expect(store.deleteBankLink).not.toHaveBeenCalled();
    expect(logged()).not.toContainEqual(expect.stringContaining("plaid_item_queued"));
  });

  it("has nothing to do for a student with no bank, even when Plaid is not set up", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [] });
    expect(await removeBankLinksForStudent(STUDENT, null)).toEqual({ kind: "none" });
    expect(plaid.removeItem).not.toHaveBeenCalled();
    expect(store.disconnectBankLink).not.toHaveBeenCalled();
  });

  it("Plaid down: still deletes our copy and queues the Item, logging a count and no id", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
    plaid.removeItem.mockResolvedValue(PLAID_DOWN);
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "removed" });
    expect(store.disconnectBankLink).toHaveBeenCalledWith(STUDENT, ["item-1"]);
    expect(logged()).toContain(JSON.stringify({ event: "plaid_item_queued", count: 1 }));
    expect(logged().join("\n")).not.toContain("item-1");
  });

  it("queues an Item Plaid refused for any other reason too", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "plaid", code: "INTERNAL_SERVER_ERROR" });
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "removed" });
    expect(store.disconnectBankLink).toHaveBeenCalledWith(STUDENT, ["item-1"]);
  });

  it("does not queue an Item Plaid says is already gone", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
    plaid.removeItem.mockResolvedValue(ALREADY_GONE);
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "removed" });
    expect(store.disconnectBankLink).toHaveBeenCalledWith(STUDENT, []);
  });

  it("mixed: queues only the Item Plaid did not remove, never one whose token cannot be opened", async () => {
    store.readAccessTokens.mockResolvedValue({
      ok: true,
      value: [token(1), token(2), token(3), { kind: "unreadable", itemId: "item-4" }],
    });
    plaid.removeItem.mockImplementation(async (_config: PlaidConfig, accessToken: string) =>
      accessToken === "access-1" ? { ok: true, data: {} } : accessToken === "access-2" ? PLAID_DOWN : ALREADY_GONE,
    );
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "removed" });
    expect(plaid.removeItem).toHaveBeenCalledTimes(3);
    expect(store.disconnectBankLink).toHaveBeenCalledWith(STUDENT, ["item-2"]);
    expect(logged()).toContain(JSON.stringify({ event: "plaid_item_orphaned", reason: "token_unreadable" }));
    expect(logged()).toContain(JSON.stringify({ event: "plaid_item_queued", count: 1 }));
  });

  it("changes nothing when a bank is linked but the Plaid settings are missing", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
    expect(await removeBankLinksForStudent(STUDENT, null)).toEqual({ kind: "not_configured" });
    expect(store.disconnectBankLink).not.toHaveBeenCalled();
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  it("says none when another disconnect deleted everything first", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
    store.disconnectBankLink.mockResolvedValue({ ok: true, value: false });
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "none" });
  });

  it("reports a database failure without touching Plaid", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: false, error: { code: "08006", message: "down" } });
    expect((await removeBankLinksForStudent(STUDENT, CONFIG)).kind).toBe("database_error");
    expect(plaid.removeItem).not.toHaveBeenCalled();
  });

  it("reports a failed disconnect as a database error, without the old fallback", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
    store.disconnectBankLink.mockResolvedValue({ ok: false, error: { code: "08006", message: "down" } });
    expect((await removeBankLinksForStudent(STUDENT, CONFIG)).kind).toBe("database_error");
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  // Merged before 20261118200000_disconnect_never_blocked.sql is applied.
  describe.each([
    ["PostgREST", "PGRST202"],
    ["Postgres", "42883"],
  ])("before the migration (%s answers %s)", (_who, code) => {
    beforeEach(() => {
      store.disconnectBankLink.mockResolvedValue({ ok: false, error: { code, message: "no such function" } });
    });

    it("Plaid down: changes nothing, as before", async () => {
      store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
      plaid.removeItem.mockResolvedValue(PLAID_DOWN);
      expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "plaid_unreachable" });
      expect(store.deleteBankLink).not.toHaveBeenCalled();
      expect(logged()).toContain(JSON.stringify({ event: "bank_disconnect_legacy" }));
    });

    it("Plaid removed it: deletes with delete_bank_link, as before", async () => {
      store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
      expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "removed" });
      expect(store.deleteBankLink).toHaveBeenCalledWith(STUDENT);
    });

    it("an unreadable token is still deleted locally, as before", async () => {
      store.readAccessTokens.mockResolvedValue({ ok: true, value: [{ kind: "unreadable", itemId: "item-1" }] });
      store.deleteBankLink.mockResolvedValue({ ok: true, value: false });
      expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "none" });
      expect(store.deleteBankLink).toHaveBeenCalled();
    });
  });
});
