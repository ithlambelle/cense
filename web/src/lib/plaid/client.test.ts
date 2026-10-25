import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createLinkToken, exchangePublicToken, getAccounts, itemAlreadyGone, needsReconnect, removeItem } from "./client";
import type { PlaidConfig } from "./config";
import type { TokenKey } from "./token-box";

const CONFIG: PlaidConfig = { clientId: "client-id", secret: "the-secret", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) as TokenKey };

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof answer>) => {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) as Record<string, unknown> };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Plaid calls", () => {
  it("send the client id and secret as headers, never in the body", async () => {
    const fetchMock = answer(200, { access_token: "access-sandbox-1", item_id: "item-1", request_id: "r" });
    const result = await exchangePublicToken(CONFIG, "public-sandbox-1");
    // Only the fields Cense uses are kept.
    expect(result).toEqual({ ok: true, data: { access_token: "access-sandbox-1", item_id: "item-1" } });
    const { url, headers, body } = sent(fetchMock);
    expect(url).toBe("https://sandbox.plaid.com/item/public_token/exchange");
    expect(headers["PLAID-CLIENT-ID"]).toBe("client-id");
    expect(headers["PLAID-SECRET"]).toBe("the-secret");
    expect(body).toEqual({ public_token: "public-sandbox-1" });
    expect(JSON.stringify(body)).not.toContain("the-secret");
  });

  it("ask Link for a new bank with only everyday accounts and cards, and only the student's pseudonymous id", async () => {
    const fetchMock = answer(200, { link_token: "link-sandbox-1", expiration: "2026-10-25T22:00:00Z" });
    await createLinkToken(CONFIG, "student-uuid");
    const { body } = sent(fetchMock);
    expect(body).toMatchObject({
      client_name: "Cense",
      country_codes: ["US"],
      user: { client_user_id: "student-uuid" },
      products: ["transactions"],
      account_filters: { depository: { account_subtypes: ["all"] }, credit: { account_subtypes: ["credit card"] } },
    });
    expect(Object.keys(body.user as object)).toEqual(["client_user_id"]);
  });

  it("open Link in update mode with the access token and no products", async () => {
    const fetchMock = answer(200, { link_token: "link-sandbox-2", expiration: "2026-10-25T22:00:00Z" });
    await createLinkToken(CONFIG, "student-uuid", "access-sandbox-1");
    const { body } = sent(fetchMock);
    expect(body.access_token).toBe("access-sandbox-1");
    expect(body).not.toHaveProperty("products");
  });

  it("return Plaid's error code, and log only the code, type and request id", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    answer(400, { error_type: "ITEM_ERROR", error_code: "ITEM_LOGIN_REQUIRED", error_message: "the login details of this item have changed", display_message: null, request_id: "req-9" });
    const result = await getAccounts(CONFIG, "access-sandbox-secret-token");
    expect(result).toEqual({ ok: false, kind: "plaid", code: "ITEM_LOGIN_REQUIRED" });
    expect(result.ok === false && needsReconnect(result)).toBe(true);
    const logged = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("ITEM_LOGIN_REQUIRED");
    expect(logged).toContain("req-9");
    expect(logged).not.toContain("access-sandbox-secret-token");
    expect(logged).not.toContain("login details");
  });

  it("say when Plaid cannot be reached, without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await removeItem(CONFIG, "access-sandbox-1")).toEqual({ ok: false, kind: "network" });
  });

  it("refuse an answer that is not Plaid's documented shape", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    answer(200, { accounts: "nope" });
    expect(await getAccounts(CONFIG, "access-sandbox-1")).toEqual({ ok: false, kind: "unexpected" });
  });

  it("read accounts and the bank's name", async () => {
    answer(200, {
      accounts: [{ account_id: "a", balances: { available: 100, current: 110, iso_currency_code: "USD", limit: null }, mask: "0000", name: "Plaid Checking", official_name: null, type: "depository", subtype: "checking" }],
      item: { item_id: "i", institution_id: "ins_109508", institution_name: "First Platypus Bank" },
      request_id: "r",
    });
    const result = await getAccounts(CONFIG, "access-sandbox-1");
    expect(result.ok && result.data.item.institution_name).toBe("First Platypus Bank");
    expect(result.ok && result.data.accounts[0].name).toBe("Plaid Checking");
  });
});

describe("itemAlreadyGone", () => {
  it("treats a removed or unknown Item as gone, and nothing else", () => {
    expect(itemAlreadyGone({ ok: false, kind: "plaid", code: "ITEM_NOT_FOUND" })).toBe(true);
    expect(itemAlreadyGone({ ok: false, kind: "plaid", code: "INVALID_ACCESS_TOKEN" })).toBe(true);
    expect(itemAlreadyGone({ ok: false, kind: "plaid", code: "INTERNAL_SERVER_ERROR" })).toBe(false);
    expect(itemAlreadyGone({ ok: false, kind: "network" })).toBe(false);
  });
});
