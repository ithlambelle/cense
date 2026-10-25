// A stand-in for Plaid's sandbox, so the safe-to-spend journeys never call
// Plaid: no keys in CI, and the same bank every run. Two parts:
//
// 1. An API server. The app reaches it because it is started with
//    PLAID_BASE_URL pointing here (README, "Plaid sandbox"). It answers the
//    five endpoints the app calls, in Plaid's shapes, and records every request
//    so a test can check what left Cense.
// 2. A fake Plaid Link script. Link itself only loads from cdn.plaid.com, so
//    installFakeLink() answers that address with a small Plaid.create() that
//    ends the way the test asks: connected, cancelled, a bank error, or a
//    public token that has expired.
import { createServer, type IncomingMessage, type Server } from "node:http";

import type { BrowserContext } from "@playwright/test";

export const FAKE_PLAID_PORT = Number(process.env.E2E_FAKE_PLAID_PORT ?? 3598);

// The one bank every linked student gets: $1,240 in checking, $500 in
// savings (not counted) and $310 owed on a card.
export const FAKE_BANK = {
  institution: "First Platypus Bank",
  checkingCents: 124_000,
  savingsCents: 50_000,
  cardCents: 31_000,
};

// What the next calls answer. Reset before each test.
// "gone": the Item was removed at Plaid (for example from my.plaid.com), so
// every call with its token answers INVALID_ACCESS_TOKEN.
export const behavior = {
  accounts: "ok" as "ok" | "login_required" | "down" | "gone",
  remove: "ok" as "ok" | "down",
};

// Every request the app sent: the path, the client id and secret headers, and
// the body. Access tokens handed out, so a test can look for them in pages.
export const received: { path: string; clientId: string | null; secret: string | null; body: Record<string, unknown> }[] = [];
export const issuedAccessTokens: string[] = [];
export const removedAccessTokens: string[] = [];

export function resetFakePlaid() {
  behavior.accounts = "ok";
  behavior.remove = "ok";
  received.length = 0;
}

let counter = 0;
const requestId = () => `req-fake-${++counter}`;

function plaidError(status: number, errorType: string, errorCode: string) {
  return {
    status,
    body: {
      error_type: errorType,
      error_code: errorCode,
      error_message: `fake ${errorCode}`,
      display_message: null,
      request_id: requestId(),
    },
  };
}

function account(id: string, name: string, mask: string, type: string, subtype: string, cents: number) {
  const amount = cents / 100;
  return {
    account_id: id,
    balances: {
      available: type === "credit" ? 2000 - amount : amount,
      current: amount,
      limit: type === "credit" ? 2000 : null,
      iso_currency_code: "USD",
      unofficial_currency_code: null,
    },
    mask,
    name,
    official_name: null,
    type,
    subtype,
  };
}

function answer(path: string, body: Record<string, unknown>): { status: number; body: unknown } {
  switch (path) {
    case "/link/token/create": {
      const update = typeof body.access_token === "string";
      return {
        status: 200,
        body: {
          link_token: `link-sandbox-fake-${update ? "update" : "create"}-${++counter}`,
          expiration: new Date(Date.now() + 4 * 3600_000).toISOString(),
          request_id: requestId(),
        },
      };
    }
    case "/item/public_token/exchange": {
      if (body.public_token === "public-sandbox-expired") return plaidError(400, "INVALID_INPUT", "INVALID_PUBLIC_TOKEN");
      if (body.public_token !== "public-sandbox-good") return plaidError(400, "INVALID_INPUT", "INVALID_PUBLIC_TOKEN");
      // Random parts: the database keeps Items from earlier runs, and a
      // restarted worker starts counting again.
      const unique = `${++counter}-${Math.random().toString(36).slice(2, 10)}`;
      const accessToken = `access-sandbox-fake-${unique}`;
      issuedAccessTokens.push(accessToken);
      return { status: 200, body: { access_token: accessToken, item_id: `item-fake-${unique}`, request_id: requestId() } };
    }
    case "/accounts/get": {
      if (!issuedAccessTokens.includes(String(body.access_token)) || removedAccessTokens.includes(String(body.access_token))) {
        return plaidError(400, "INVALID_INPUT", "INVALID_ACCESS_TOKEN");
      }
      if (behavior.accounts === "gone") return plaidError(400, "INVALID_INPUT", "INVALID_ACCESS_TOKEN");
      if (behavior.accounts === "login_required") return plaidError(400, "ITEM_ERROR", "ITEM_LOGIN_REQUIRED");
      if (behavior.accounts === "down") return plaidError(502, "INSTITUTION_ERROR", "INSTITUTION_DOWN");
      return {
        status: 200,
        body: {
          accounts: [
            account("acc-checking", "Plaid Checking", "0000", "depository", "checking", FAKE_BANK.checkingCents),
            account("acc-savings", "Plaid Saving", "1111", "depository", "savings", FAKE_BANK.savingsCents),
            account("acc-card", "Plaid Credit Card", "3333", "credit", "credit card", FAKE_BANK.cardCents),
            account("acc-loan", "Plaid Student Loan", "7777", "loan", "student", 6_532_000),
          ],
          item: { item_id: "item-fake", institution_id: "ins_109508", institution_name: FAKE_BANK.institution },
          request_id: requestId(),
        },
      };
    }
    case "/item/remove": {
      if (behavior.remove === "down") return plaidError(500, "API_ERROR", "INTERNAL_SERVER_ERROR");
      if (behavior.accounts === "gone") return plaidError(400, "INVALID_INPUT", "INVALID_ACCESS_TOKEN");
      removedAccessTokens.push(String(body.access_token));
      return { status: 200, body: { request_id: requestId() } };
    }
    default:
      return plaidError(404, "INVALID_REQUEST", "NOT_FOUND");
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk: Buffer) => (data += chunk.toString("utf8")));
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

export async function startFakePlaid(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://fake").pathname;
    const raw = await readBody(request);
    let body: Record<string, unknown> = {};
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      // Answered as Plaid answers bad JSON.
    }
    received.push({
      path,
      clientId: request.headers["plaid-client-id"]?.toString() ?? null,
      secret: request.headers["plaid-secret"]?.toString() ?? null,
      body,
    });
    const result = request.method === "POST" ? answer(path, body) : plaidError(405, "INVALID_REQUEST", "METHOD_NOT_ALLOWED");
    response.writeHead(result.status, { "content-type": "application/json" });
    response.end(JSON.stringify(result.body));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_PLAID_PORT, "127.0.0.1", resolve);
  });
  return server;
}

// How the fake Link ends when opened.
export type LinkOutcome = "success" | "cancel" | "bank_error" | "expired";

// The address the app loads Link from, as Plaid requires.
export const PLAID_LINK_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

// Answers the Link script for this browser context. Registered after
// blockExternalRequests, so it runs first. `outcome` is read on every open, so
// a test can change it between attempts with setLinkOutcome().
export async function installFakeLink(context: BrowserContext, outcome: LinkOutcome = "success") {
  await context.addInitScript((initial) => {
    (window as unknown as { __fakePlaidOutcome: string }).__fakePlaidOutcome = initial;
  }, outcome);
  await context.route(PLAID_LINK_SCRIPT, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.__fakePlaidOpened = [];
        window.Plaid = {
          create: function (config) {
            return {
              open: function () {
                var outcome = window.__fakePlaidOutcome;
                window.__fakePlaidOpened.push({ token: config.token, outcome: outcome });
                setTimeout(function () {
                  var metadata = { institution: { name: "First Platypus Bank", institution_id: "ins_109508" }, accounts: [], link_session_id: "fake" };
                  if (outcome === "success") config.onSuccess("public-sandbox-good", metadata);
                  else if (outcome === "expired") config.onSuccess("public-sandbox-expired", metadata);
                  else if (outcome === "bank_error") config.onExit({ error_type: "INSTITUTION_ERROR", error_code: "INSTITUTION_DOWN", error_message: "fake", display_message: null }, metadata);
                  else config.onExit(null, metadata);
                }, 50);
              },
              exit: function () {},
              destroy: function () {},
            };
          },
        };
      `,
    }),
  );
}
