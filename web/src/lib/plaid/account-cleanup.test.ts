import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const plaid = vi.hoisted(() => ({ removeItem: vi.fn() }));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), ...plaid }));

import type { ServiceClient } from "@/lib/supabase/service";

import { runAccountCleanup, runAccountCleanupWithHeartbeat } from "./account-cleanup";
import type { PlaidConfig } from "./config";
import { parseTokenKey, sealToken } from "./token-box";

const config: PlaidConfig = { clientId: "fake", secret: "fake", baseUrl: "https://sandbox.plaid.com", tokenKey: parseTokenKey(Buffer.alloc(32, 1).toString("base64"))! };
const binding = { studentId: "deleted-student", itemId: "item-test" };
const claim = { id: "queue-test", student_id: binding.studentId, item_id: binding.itemId, claim_id: "lease-test", token_ciphertext: sealToken("access-test", config.tokenKey, binding) };
function service(rows: Array<typeof claim & { gives_up_if_unreadable?: boolean }> = [claim]) {
  let claimed = false;
  const rpc = vi.fn(async (name: string) => ({ data: name === "claim_plaid_account_cleanup" ? (claimed ? [] : (claimed = true, rows)) : true, error: null }));
  return { client: { rpc } as unknown as ServiceClient, rpc };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

beforeEach(() => { plaid.removeItem.mockReset(); plaid.removeItem.mockResolvedValue({ ok: true, data: {} }); });

describe("deleted account Plaid cleanup", () => {
  it("decrypts only on the server and erases ciphertext after a confirmed removal", async () => {
    const { client, rpc } = service();
    expect(await runAccountCleanup(client, config)).toEqual({ claimed: 1, removed: 1, failed: 0, gaveUp: 0, unavailable: false, deferred: false });
    expect(plaid.removeItem).toHaveBeenCalledWith(config, "access-test");
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", { p_id: claim.id, p_claim_id: claim.claim_id, p_removed: true });
  });

  it.each(["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"])("acknowledges an already removed Item (%s)", async (code) => {
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "plaid", code });
    expect(await runAccountCleanup(service().client, config)).toMatchObject({ removed: 1, failed: 0 });
  });

  it("retains the token after a Plaid outage", async () => {
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "network" });
    const { client, rpc } = service();
    expect(await runAccountCleanup(client, config)).toMatchObject({ removed: 0, failed: 1 });
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", expect.objectContaining({ p_removed: false }));
  });

  it("retains unreadable tokens and reports failure without exposing their contents", async () => {
    const { client, rpc } = service([{ ...claim, student_id: "wrong-binding" }]);
    const result = await runAccountCleanup(client, config);
    expect(result).toMatchObject({ failed: 1, removed: 0 });
    expect(plaid.removeItem).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", expect.objectContaining({ p_removed: false }));
    for (const secret of [claim.student_id, claim.item_id, claim.token_ciphertext, "access-test"]) expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("can run without Plaid settings when the queue is empty", async () => {
    expect(await runAccountCleanup(service([]).client, null)).toMatchObject({ failed: 0, unavailable: false, deferred: false });
  });

  it("keeps queued work and reports missing settings", async () => {
    const { client, rpc } = service();
    expect(await runAccountCleanup(client, null)).toMatchObject({ failed: 1, unavailable: true });
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", expect.objectContaining({ p_removed: false }));
  });

  it("does not report removal if acknowledgement lost its lease", async () => {
    const { client, rpc } = service();
    rpc.mockResolvedValueOnce({ data: [claim], error: null }).mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: [], error: null });
    expect(await runAccountCleanup(client, config)).toMatchObject({ failed: 1, removed: 0 });
  });

  it("reports a database outage without leaking its error text", async () => {
    const client = { rpc: vi.fn().mockRejectedValue(new Error("private database detail")) } as unknown as ServiceClient;
    expect(await runAccountCleanup(client, config)).toEqual({ claimed: 0, removed: 0, failed: 0, gaveUp: 0, unavailable: true, deferred: false });
  });
  it("drains more than one five-row batch", async () => {
    const { client, rpc } = service([]);
    const rows = Array.from({ length: 7 }, (_, n) => ({ ...claim, id: `queue-${n}` }));
    let batch = 0;
    rpc.mockImplementation(async (name) => ({ data: name === "claim_plaid_account_cleanup" ? [rows.slice(0, 5), rows.slice(5), []][batch++] : true, error: null }));
    expect(await runAccountCleanup(client, config)).toMatchObject({ claimed: 7, removed: 7, failed: 0, deferred: false });
    expect(rpc.mock.calls.filter(([name]) => name === "claim_plaid_account_cleanup")).toHaveLength(3);
  });

  it("leaves the next batch unclaimed when the request budget runs out", async () => {
    let clock = 0;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    plaid.removeItem.mockImplementation(async () => { clock = 31_000; return { ok: true, data: {} }; });
    const { client, rpc } = service();
    expect(await runAccountCleanup(client, config, { startedAt: 0 })).toMatchObject({ removed: 1, deferred: true });
    expect(rpc.mock.calls.filter(([name]) => name === "claim_plaid_account_cleanup")).toHaveLength(1);
  });

  // Security audit of a8fe7d4: a forged token saved before the account was
  // deleted can never be decrypted. Only that failure counts toward giving
  // up; the run that gives it up fails the cleanup check once and logs once.
  const PLAID_ENV = { PLAID_CLIENT_ID: "fake", PLAID_SECRET: "fake", PLAID_ENV: "sandbox", PLAID_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64") };
  it("gives up an unreadable row on its fifth unreadable failure, logging once and failing the check once", async () => {
    vi.stubEnv("PLAID_CLEANUP_HEARTBEAT_URL", "https://hc-ping.com/cleanup-test");
    for (const [name, value] of Object.entries(PLAID_ENV)) vi.stubEnv(name, value);
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response("OK"));
    vi.stubGlobal("fetch", send);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const forged = { ...claim, token_ciphertext: "v1." + "A".repeat(40), gives_up_if_unreadable: true };
    const { client, rpc } = service([forged]);
    expect(await runAccountCleanupWithHeartbeat(client)).toMatchObject({ claimed: 1, removed: 0, failed: 0, gaveUp: 1 });
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", { p_id: claim.id, p_claim_id: claim.claim_id, p_removed: false, p_reason: "undecryptable" });
    expect(log.mock.calls).toEqual([[JSON.stringify({ event: "plaid_cleanup_gave_up" })]]);
    expect(send.mock.calls.map(([url]) => url)).toEqual(["https://hc-ping.com/cleanup-test/start", "https://hc-ping.com/cleanup-test/fail"]);
    for (const secret of [forged.student_id, forged.item_id, forged.token_ciphertext]) expect(JSON.stringify([log.mock.calls, send.mock.calls])).not.toContain(secret);
  });

  it("stays green on the next run, once the given-up row is no longer claimed", async () => {
    vi.stubEnv("PLAID_CLEANUP_HEARTBEAT_URL", "https://hc-ping.com/cleanup-test");
    for (const [name, value] of Object.entries(PLAID_ENV)) vi.stubEnv(name, value);
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response("OK"));
    vi.stubGlobal("fetch", send);
    expect(await runAccountCleanupWithHeartbeat(service([]).client)).toMatchObject({ claimed: 0, gaveUp: 0, failed: 0 });
    expect(send.mock.calls.map(([url]) => url)).toEqual(["https://hc-ping.com/cleanup-test/start", "https://hc-ping.com/cleanup-test"]);
  });

  it("fails, without giving up, on an unreadable failure before the fifth", async () => {
    const { client, rpc } = service([{ ...claim, student_id: "wrong-binding", gives_up_if_unreadable: false }]);
    expect(await runAccountCleanup(client, config)).toMatchObject({ failed: 1, gaveUp: 0 });
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", expect.objectContaining({ p_removed: false, p_reason: "undecryptable" }));
  });

  it("never gives up a Plaid error, however many times it has failed", async () => {
    plaid.removeItem.mockResolvedValue({ ok: false, kind: "network" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client, rpc } = service([{ ...claim, gives_up_if_unreadable: true }]);
    expect(await runAccountCleanup(client, config)).toMatchObject({ failed: 1, gaveUp: 0 });
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", expect.objectContaining({ p_removed: false, p_reason: "plaid_error" }));
    expect(log).not.toHaveBeenCalled();
  });

  it("never gives up because the Plaid settings or key are missing", async () => {
    const { client, rpc } = service([{ ...claim, gives_up_if_unreadable: true }]);
    expect(await runAccountCleanup(client, null)).toMatchObject({ failed: 1, gaveUp: 0, unavailable: true });
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", expect.objectContaining({ p_removed: false, p_reason: "not_configured" }));
  });

  it("acknowledges a removal with the three arguments the old function also takes", async () => {
    const { client, rpc } = service([{ ...claim, gives_up_if_unreadable: true }]);
    expect(await runAccountCleanup(client, config)).toMatchObject({ removed: 1, failed: 0, gaveUp: 0 });
    expect(rpc).toHaveBeenCalledWith("finish_plaid_account_cleanup", { p_id: claim.id, p_claim_id: claim.claim_id, p_removed: true });
  });

  it("counts a give-up as failed if the database did not take the acknowledgement", async () => {
    const row = { ...claim, student_id: "wrong-binding", gives_up_if_unreadable: true };
    const { client, rpc } = service([row]);
    rpc.mockImplementation(async (name: string) => ({ data: name === "claim_plaid_account_cleanup" ? (rpc.mock.calls.length === 1 ? [row] : []) : false, error: null }));
    expect(await runAccountCleanup(client, config)).toMatchObject({ failed: 1, gaveUp: 0 });
  });

  it("sends failures to the cleanup check, never the reminder check", async () => {
    vi.stubEnv("PLAID_CLEANUP_HEARTBEAT_URL", "https://hc-ping.com/cleanup-test");
    vi.stubEnv("REMINDER_HEARTBEAT_URL", "https://hc-ping.com/reminder-test");
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response("OK"));
    vi.stubGlobal("fetch", send);
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "missing" } }) } as unknown as ServiceClient;
    expect(await runAccountCleanupWithHeartbeat(client)).toMatchObject({ unavailable: true });
    expect(send.mock.calls.map(([url]) => url)).toEqual(["https://hc-ping.com/cleanup-test/start", "https://hc-ping.com/cleanup-test/fail"]);
  });

});
