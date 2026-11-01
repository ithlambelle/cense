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

describe("plaidConfig", () => {
  it("talks to Plaid's sandbox when every value is set", () => {
    const config = plaidConfig(ENV);
    expect(config?.baseUrl).toBe("https://sandbox.plaid.com");
    expect(config?.clientId).toBe("client-id");
  });

  it("is off unless the environment is sandbox: a production key can never be used", () => {
    for (const env of ["production", "development", "Sandbox", "", undefined]) {
      expect(plaidConfig({ ...ENV, PLAID_ENV: env })).toBeNull();
    }
  });

  it("is off when a value is missing or the token key is not 32 bytes", () => {
    for (const name of Object.keys(ENV)) expect(plaidConfig({ ...ENV, [name]: "" })).toBeNull();
    expect(plaidConfig({ ...ENV, PLAID_TOKEN_KEY: randomBytes(31).toString("base64") })).toBeNull();
  });

  it("takes a stand-in address only on this machine, since the secret is sent to it", () => {
    expect(plaidConfig({ ...ENV, PLAID_BASE_URL: "http://127.0.0.1:3598" })?.baseUrl).toBe("http://127.0.0.1:3598");
    expect(plaidConfig({ ...ENV, PLAID_BASE_URL: "http://localhost:3598/" })?.baseUrl).toBe("http://localhost:3598");
    for (const url of ["https://evil.example", "http://10.0.0.5:3598", "https://production.plaid.com", "not a url"]) {
      expect(plaidConfig({ ...ENV, PLAID_BASE_URL: url })).toBeNull();
    }
  });
});
