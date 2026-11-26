import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { plaidConfig } from "./config";

const ENV = {
  PLAID_CLIENT_ID: "client-id",
  PLAID_SECRET: "sandbox-secret",
  PLAID_ENV: "sandbox",
  PLAID_TOKEN_KEY: randomBytes(32).toString("base64"),
};

const PRODUCTION = { ...ENV, PLAID_SECRET: "production-secret", PLAID_ENV: "production" };

describe("plaidConfig", () => {
  it("talks to Plaid's sandbox when every value is set", () => {
    const config = plaidConfig(ENV);
    expect(config?.baseUrl).toBe("https://sandbox.plaid.com");
    expect(config?.clientId).toBe("client-id");
    expect(config?.environment).toBe("sandbox");
  });

  it("talks to Plaid's production only when PLAID_ENV says production", () => {
    const config = plaidConfig(PRODUCTION);
    expect(config?.baseUrl).toBe("https://production.plaid.com");
    expect(config?.environment).toBe("production");
    expect(plaidConfig({ ...PRODUCTION, PLAID_ENV: " production " })?.environment).toBe("production");
  });

  it("is off for any environment other than sandbox or production, so a typo never reaches a real bank", () => {
    for (const env of ["development", "Sandbox", "Production", "prod", "live", "", undefined]) {
      expect(plaidConfig({ ...ENV, PLAID_ENV: env })).toBeNull();
      expect(plaidConfig({ ...PRODUCTION, PLAID_ENV: env })).toBeNull();
    }
  });

  it("is off when a value is missing or the token key is not 32 bytes", () => {
    for (const name of Object.keys(ENV)) expect(plaidConfig({ ...ENV, [name]: "" })).toBeNull();
    for (const name of Object.keys(PRODUCTION)) expect(plaidConfig({ ...PRODUCTION, [name]: "" })).toBeNull();
    expect(plaidConfig({ ...ENV, PLAID_TOKEN_KEY: randomBytes(31).toString("base64") })).toBeNull();
  });

  it("never sends production keys to a stand-in: an override in production turns it off", () => {
    for (const url of ["http://127.0.0.1:3598", "http://localhost:3598", "https://production.plaid.com"]) {
      expect(plaidConfig({ ...PRODUCTION, PLAID_BASE_URL: url })).toBeNull();
    }
  });

  it("takes a stand-in address only on this machine, since the secret is sent to it", () => {
    expect(plaidConfig({ ...ENV, PLAID_BASE_URL: "http://127.0.0.1:3598" })?.baseUrl).toBe("http://127.0.0.1:3598");
    expect(plaidConfig({ ...ENV, PLAID_BASE_URL: "http://localhost:3598/" })?.baseUrl).toBe("http://localhost:3598");
    for (const url of ["https://evil.example", "http://10.0.0.5:3598", "https://production.plaid.com", "not a url"]) {
      expect(plaidConfig({ ...ENV, PLAID_BASE_URL: url })).toBeNull();
    }
  });
});
