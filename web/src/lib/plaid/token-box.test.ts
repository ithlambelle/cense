import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// "server-only" refuses to load outside a server build; this test is the server.
vi.mock("server-only", () => ({}));

import { openToken, parseTokenKey, sealToken, type TokenKey } from "./token-box";

const key = parseTokenKey(randomBytes(32).toString("base64")) as TokenKey;
const binding = { studentId: "11111111-1111-4111-8111-111111111111", itemId: "item-1" };
// Made up, and not shaped like a real Plaid token, so secret scanners stay quiet.
const TOKEN = "made-up-access-token-for-this-test";

describe("parseTokenKey", () => {
  it("takes exactly 32 bytes of base64", () => {
    expect(parseTokenKey(randomBytes(32).toString("base64"))).not.toBeNull();
    expect(parseTokenKey(` ${randomBytes(32).toString("base64")}\n`)).not.toBeNull();
    expect(parseTokenKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseTokenKey(randomBytes(33).toString("base64"))).toBeNull();
    expect(parseTokenKey("not a key!")).toBeNull();
    expect(parseTokenKey("")).toBeNull();
    expect(parseTokenKey(undefined)).toBeNull();
  });
});

describe("sealToken and openToken", () => {
  it("round-trips, and the sealed value never contains the token", () => {
    const sealed = sealToken(TOKEN, key, binding);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(TOKEN);
    expect(sealed).not.toContain("made-up");
    expect(openToken(sealed, key, binding)).toBe(TOKEN);
  });

  it("seals the same token differently each time (a fresh IV)", () => {
    expect(sealToken(TOKEN, key, binding)).not.toBe(sealToken(TOKEN, key, binding));
  });

  it("does not open for another student or item, as if the row were copied", () => {
    const sealed = sealToken(TOKEN, key, binding);
    expect(openToken(sealed, key, { ...binding, studentId: "22222222-2222-4222-8222-222222222222" })).toBeNull();
    expect(openToken(sealed, key, { ...binding, itemId: "item-2" })).toBeNull();
  });

  it("does not open with another key, or once changed", () => {
    const sealed = sealToken(TOKEN, key, binding);
    const other = parseTokenKey(randomBytes(32).toString("base64")) as TokenKey;
    expect(openToken(sealed, other, binding)).toBeNull();
    const raw = Buffer.from(sealed.slice(3), "base64url");
    raw[raw.length - 1] ^= 1;
    expect(openToken(`v1.${raw.toString("base64url")}`, key, binding)).toBeNull();
  });

  it("refuses values that are not its own", () => {
    expect(openToken(TOKEN, key, binding)).toBeNull();
    expect(openToken("v1.", key, binding)).toBeNull();
    expect(openToken("v2.abc", key, binding)).toBeNull();
  });
});
