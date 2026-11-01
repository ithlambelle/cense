import "server-only";

import { z } from "zod";

import type { PlaidConfig } from "./config";

// The five Plaid calls safe to spend makes, over plain fetch (no SDK). Called
// only from route handlers. The client id and secret go in headers, never in
// a body. Nothing Plaid sends back is logged: a failure logs the endpoint,
// Plaid's error type and code, and its request id, which Plaid support needs.
// https://plaid.com/docs/api/

const TIMEOUT_MS = 10_000;
// The API version this code was written against.
const PLAID_VERSION = "2020-09-14";

export type PlaidFailure =
  // Plaid answered with an error, for example ITEM_LOGIN_REQUIRED.
  | { ok: false; kind: "plaid"; code: string }
  // No answer: offline, timed out, refused.
  | { ok: false; kind: "network" }
  // An answer that is not the shape Plaid documents.
  | { ok: false; kind: "unexpected" };

export type PlaidResult<T> = { ok: true; data: T } | PlaidFailure;

const errorSchema = z.object({
  error_type: z.string(),
  error_code: z.string(),
  request_id: z.string().optional(),
});

async function call<T>(config: PlaidConfig, path: string, body: Record<string, unknown>, schema: z.ZodType<T>): Promise<PlaidResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "PLAID-CLIENT-ID": config.clientId,
          "PLAID-SECRET": config.secret,
          "Plaid-Version": PLAID_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      console.error(JSON.stringify({ event: "plaid_unreachable", path }));
      return { ok: false, kind: "network" };
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      if (controller.signal.aborted) {
        console.error(JSON.stringify({ event: "plaid_unreachable", path }));
        return { ok: false, kind: "network" };
      }
    }

    if (!response.ok) {
      const error = errorSchema.safeParse(payload);
      console.error(
        JSON.stringify({
          event: "plaid_error",
          path,
          status: response.status,
          error_type: error.success ? error.data.error_type : null,
          error_code: error.success ? error.data.error_code : null,
          request_id: error.success ? (error.data.request_id ?? null) : null,
        }),
      );
      return error.success ? { ok: false, kind: "plaid", code: error.data.error_code } : { ok: false, kind: "unexpected" };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      console.error(JSON.stringify({ event: "plaid_unexpected_response", path }));
      return { ok: false, kind: "unexpected" };
    }
    return { ok: true, data: parsed.data };
  } finally {
    clearTimeout(timer);
  }
}

// Link for a new bank, or, given the access token, update mode for one that
// needs the student to sign in again (the same Item, no new token).
// Transactions is the product requested because Link needs one and Balance
// alone is not allowed; Cense never calls the transactions endpoints. Only
// everyday accounts and credit cards can be picked: no loans or investments.
export async function createLinkToken(config: PlaidConfig, studentId: string, accessToken?: string) {
  const base = {
    client_name: "Cense",
    language: "en",
    country_codes: ["US"],
    // The student's pseudonymous id: no name, email or phone goes to Plaid.
    user: { client_user_id: studentId },
  };
  const body = accessToken
    ? { ...base, access_token: accessToken }
    : {
        ...base,
        products: ["transactions"],
        account_filters: {
          depository: { account_subtypes: ["all"] },
          credit: { account_subtypes: ["credit card"] },
        },
      };
  return call(config, "/link/token/create", body, z.object({ link_token: z.string().min(1), expiration: z.string() }));
}

export async function exchangePublicToken(config: PlaidConfig, publicToken: string) {
  return call(
    config,
    "/item/public_token/exchange",
    { public_token: publicToken },
    z.object({ access_token: z.string().min(1), item_id: z.string().min(1) }),
  );
}

const plaidAccountSchema = z.object({
  account_id: z.string(),
  balances: z.object({
    available: z.number().nullable(),
    current: z.number().nullable(),
    iso_currency_code: z.string().nullable(),
  }),
  mask: z.string().nullable(),
  name: z.string(),
  type: z.string(),
  subtype: z.string().nullable(),
});

export type PlaidAccount = z.infer<typeof plaidAccountSchema>;

// Balances as Plaid last read them (free; /accounts/balance/get is the paid
// real-time read, not needed for a daily number).
export async function getAccounts(config: PlaidConfig, accessToken: string) {
  return call(
    config,
    "/accounts/get",
    { access_token: accessToken },
    z.object({
      accounts: z.array(plaidAccountSchema),
      item: z.object({ institution_name: z.string().nullable().optional() }),
    }),
  );
}

// Ends the Item at Plaid: the token stops working and, outside the sandbox,
// billing stops.
export async function removeItem(config: PlaidConfig, accessToken: string) {
  return call(config, "/item/remove", { access_token: accessToken }, z.object({}).loose());
}

// Plaid's codes that mean the Item is already gone, so there is nothing left
// to remove there.
export function itemAlreadyGone(failure: PlaidFailure): boolean {
  return failure.kind === "plaid" && ["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"].includes(failure.code);
}

// The bank wants the student to sign in again (Link in update mode fixes it).
export function needsReconnect(failure: PlaidFailure): boolean {
  return failure.kind === "plaid" && failure.code === "ITEM_LOGIN_REQUIRED";
}
