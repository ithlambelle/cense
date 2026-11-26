// Created with Claude Code (2026-11-25).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

const config = vi.hoisted(() => ({ plaidConfig: vi.fn() }));
vi.mock("@/lib/plaid/config", () => config);

const plaid = vi.hoisted(() => ({ createLinkToken: vi.fn() }));
vi.mock("@/lib/plaid/client", async (importOriginal) => ({ ...(await importOriginal<object>()), ...plaid }));

const store = vi.hoisted(() => ({ linkStatus: vi.fn(), readAccessToken: vi.fn() }));
vi.mock("@/lib/plaid/store", () => store);

import { POST } from "./route";

const SANDBOX = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32), environment: "sandbox" as const };
const PRODUCTION = { ...SANDBOX, baseUrl: "https://production.plaid.com", environment: "production" as const };
const LINK = { ok: true, data: { link_token: "link-production-1", expiration: "2026-11-26T12:00:00Z" } };

// The pilot's database function (lib/plaid/pilot.ts runs for real). Only
// production reaches it.
const rpc = vi.fn();
const access = (value: string) =>
  rpc.mockImplementation(async (name: string) =>
    name === "plaid_pilot_access" ? { data: value, error: null } : { data: null, error: { message: `unexpected ${name}` } },
  );

beforeEach(() => {
  auth.authenticatedStudent.mockResolvedValue({ supabase: { rpc }, studentId: "student-1", email: null });
  config.plaidConfig.mockReturnValue(PRODUCTION);
  store.linkStatus.mockResolvedValue({ ok: true, value: null });
  plaid.createLinkToken.mockResolvedValue(LINK);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const group of [auth, config, plaid, store]) for (const fn of Object.values(group)) fn.mockReset();
  rpc.mockReset();
});

describe("POST /bank-link/link-token", () => {
  it("gives every student a token in the sandbox, without asking the pilot", async () => {
    config.plaidConfig.mockReturnValue(SANDBOX);
    const response = await POST();
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("create");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("gives a pilot student with room a token for a new bank", async () => {
    access("open");
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ linkToken: "link-production-1", expiration: "2026-11-26T12:00:00.000Z", mode: "create" });
    expect(plaid.createLinkToken).toHaveBeenCalledWith(PRODUCTION, "student-1", undefined);
  });

  it("refuses a student outside the pilot, so Link never opens for them", async () => {
    access("none");
    const response = await POST();
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("pilot_only");
    expect(plaid.createLinkToken).not.toHaveBeenCalled();
  });

  it("treats an answer it does not know as not in the pilot", async () => {
    access("maybe");
    expect((await POST()).status).toBe(403);
    expect(plaid.createLinkToken).not.toHaveBeenCalled();
  });

  it("refuses a new bank when the student's allowance or the budget is used, before Plaid is asked", async () => {
    access("full");
    const response = await POST();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("bank_link_full");
    expect(plaid.createLinkToken).not.toHaveBeenCalled();
  });

  it("still lets a pilot student sign in to their bank again when full: update mode makes no Item", async () => {
    access("full");
    store.linkStatus.mockResolvedValue({ ok: true, value: "reconnect_needed" });
    store.readAccessToken.mockResolvedValue({ ok: true, value: { kind: "token", itemId: "item-1", accessToken: "access-production-1" } });
    const response = await POST();
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("update");
    expect(plaid.createLinkToken).toHaveBeenCalledWith(PRODUCTION, "student-1", "access-production-1");
  });

  it("refuses update mode too for a student taken off the pilot", async () => {
    access("none");
    store.linkStatus.mockResolvedValue({ ok: true, value: "reconnect_needed" });
    expect((await POST()).status).toBe(403);
    expect(plaid.createLinkToken).not.toHaveBeenCalled();
  });

  it("refuses when the pilot cannot be read", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    const response = await POST();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("data_unavailable");
    expect(plaid.createLinkToken).not.toHaveBeenCalled();
  });

  it("needs a session, then Plaid settings", async () => {
    auth.authenticatedStudent.mockResolvedValueOnce(null);
    expect((await POST()).status).toBe(401);
    config.plaidConfig.mockReturnValueOnce(null);
    expect((await POST()).status).toBe(503);
    expect(plaid.createLinkToken).not.toHaveBeenCalled();
  });
});
