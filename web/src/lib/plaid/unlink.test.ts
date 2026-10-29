import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const plaid = vi.hoisted(() => ({ removeItem: vi.fn() }));
vi.mock("@/lib/plaid/client", async (importOriginal) => ({ ...(await importOriginal<object>()), ...plaid }));

const store = vi.hoisted(() => ({ readAccessTokens: vi.fn(), deleteBankLink: vi.fn() }));
vi.mock("@/lib/plaid/store", () => store);

import type { Student } from "@/lib/api/auth";

import type { PlaidConfig } from "./config";
import type { TokenKey } from "./token-box";
import { removeBankLinksForStudent } from "./unlink";

const STUDENT = { supabase: {}, studentId: "student-1", email: null } as unknown as Student;
const CONFIG: PlaidConfig = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) as TokenKey };
const token = (n: number) => ({ kind: "token", itemId: `item-${n}`, accessToken: `access-${n}` });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  plaid.removeItem.mockResolvedValue({ ok: true, data: {} });
  store.deleteBankLink.mockResolvedValue({ ok: true, value: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  plaid.removeItem.mockReset();
  for (const fn of Object.values(store)) fn.mockReset();
});

// What account deletion (S28, #76) calls before deleting the sign-in record,
// and what Disconnect uses: every Item is removed at Plaid first.
describe("removeBankLinksForStudent", () => {
  it("removes every Item at Plaid, then deletes the token, balances and answers", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1), token(2)] });
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "removed" });
    expect(plaid.removeItem.mock.calls.map((call) => call[1])).toEqual(["access-1", "access-2"]);
    expect(plaid.removeItem.mock.invocationCallOrder.at(-1)).toBeLessThan(store.deleteBankLink.mock.invocationCallOrder[0]);
  });

  it("has nothing to do for a student with no bank, even when Plaid is not set up", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [] });
    expect(await removeBankLinksForStudent(STUDENT, null)).toEqual({ kind: "none" });
    expect(plaid.removeItem).not.toHaveBeenCalled();
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  it("changes nothing while Plaid cannot remove an Item, so deletion can stop and be tried again", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "network" });
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "plaid_unreachable" });
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  it("changes nothing when a bank is linked but the Plaid settings are missing", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1)] });
    expect(await removeBankLinksForStudent(STUDENT, null)).toEqual({ kind: "not_configured" });
    expect(store.deleteBankLink).not.toHaveBeenCalled();
  });

  it("deletes locally when the Item is already gone at Plaid, or its token cannot be opened", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: true, value: [token(1), { kind: "unreadable", itemId: "item-2" }] });
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "plaid", code: "ITEM_NOT_FOUND" });
    expect(await removeBankLinksForStudent(STUDENT, CONFIG)).toEqual({ kind: "removed" });
    expect(plaid.removeItem).toHaveBeenCalledTimes(1);
    expect(store.deleteBankLink).toHaveBeenCalled();
  });

  it("reports a database failure without touching Plaid", async () => {
    store.readAccessTokens.mockResolvedValue({ ok: false, error: { code: "08006", message: "down" } });
    expect((await removeBankLinksForStudent(STUDENT, CONFIG)).kind).toBe("database_error");
    expect(plaid.removeItem).not.toHaveBeenCalled();
  });
});
