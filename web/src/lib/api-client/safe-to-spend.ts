// Types come from the generated API contract.
import type { paths } from "../../../../api/openapi";
import { apiRequest, failureMessage, isUnauthorized, type ApiData, type ApiFailure } from "./client";

// The browser's side of safe to spend (US-12). Every call goes through the
// app's own API; the browser only ever holds Link's short-lived tokens.

export type SafeToSpendData = ApiData<"/safe-to-spend", "get">;
export type SaveAnswersBody = NonNullable<paths["/safe-to-spend/answers"]["put"]["requestBody"]>["content"]["application/json"];
export type BillAnswer = SaveAnswersBody["bills"][number];

// What a screen does with a failed call.
export type Outcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "signed-out" }
  // The API's error code (already_linked, reconnect_needed ...) and the line to show.
  | { kind: "failed"; code: string | null; message: string };

function failed(failure: ApiFailure): Outcome<never> {
  if (isUnauthorized(failure)) return { kind: "signed-out" };
  return { kind: "failed", code: failure.kind === "api" ? failure.code : null, message: failureMessage(failure) };
}

async function run<T>(request: Promise<{ ok: true; data: T } | ApiFailure>): Promise<Outcome<T>> {
  const result = await request;
  return result.ok ? { kind: "ok", data: result.data } : failed(result);
}

export function createLinkToken() {
  return run(apiRequest("post", "/bank-link/link-token"));
}

export function linkBank(publicToken: string) {
  return run(apiRequest("post", "/bank-link", { body: { publicToken } }));
}

export function refreshBank() {
  return run(apiRequest("post", "/bank-link/refresh"));
}

export function disconnectBank() {
  return run(apiRequest("delete", "/bank-link"));
}

export function saveSafeToSpendAnswers(body: SaveAnswersBody) {
  return run(apiRequest("put", "/safe-to-spend/answers", { body }));
}

// An amount a student typed, in whole cents: "650", "$1,200.50", "40.5".
// Null for anything else, or more than $100,000.
export function parseAmount(value: string): number | null {
  const cleaned = value.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents <= 10_000_000 ? cents : null;
}

// An amount in cents as a student would type it back: 65000 -> "650", 4050 -> "40.50".
export function amountInput(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
