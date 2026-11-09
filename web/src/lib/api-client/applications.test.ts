import { afterEach, describe, expect, it, vi } from "vitest";

import { saveAutopay, saveAutopayAnswer, saveSpendLimit } from "./applications";

const ID = "00000000-0000-4000-8000-000000000001";

function answer(status: number, body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveAutopay", () => {
  it("saves on and off with PATCH /applications/{id}", async () => {
    let fetchFn = answer(200, {});
    expect(await saveAutopay(ID, true)).toEqual({ kind: "ok" });
    expect(fetchFn.mock.calls[0][0]).toBe(`/api/v1/applications/${ID}`);
    expect(fetchFn.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ autopayStatus: "on" });
    fetchFn = answer(200, {});
    await saveAutopay(ID, false);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ autopayStatus: "off" });
  });

  it("says signed-out on 401 and passes the API's message through otherwise", async () => {
    answer(401, { error: { code: "unauthorized", message: "Sign in to continue." } });
    expect(await saveAutopay(ID, true)).toEqual({ kind: "signed-out" });
    answer(404, { error: { code: "not_found", message: "Application not found." } });
    expect(await saveAutopay(ID, true)).toEqual({ kind: "failed", message: "Application not found." });
  });
});

describe("saveAutopayAnswer", () => {
  it("saves autopay on with the payment type, or off for Not yet", async () => {
    let fetchFn = answer(200, {});
    expect(await saveAutopayAnswer(ID, "minimum")).toEqual({ kind: "ok" });
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ autopayStatus: "on", autopayPaymentType: "minimum" });
    fetchFn = answer(200, {});
    await saveAutopayAnswer(ID, "not_yet");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ autopayStatus: "off" });
    answer(401, { error: { code: "unauthorized", message: "Sign in to continue." } });
    expect(await saveAutopayAnswer(ID, "fixed_amount")).toEqual({ kind: "signed-out" });
  });
});

describe("saveSpendLimit", () => {
  it("saves the limit, then lights the spend limit star", async () => {
    const fetchFn = answer(200, {});
    expect(await saveSpendLimit(ID, 15000)).toEqual({ kind: "ok" });
    expect(fetchFn.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ spendLimitCents: 15000 });
    expect(fetchFn.mock.calls[1][0]).toBe(`/api/v1/applications/${ID}/plans/first_month/steps/spend_limit`);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
  });

  it("stops at a failed save, so the star is never lit without a limit", async () => {
    const fetchFn = answer(400, { error: { code: "invalid_request", message: "A spend limit can be at most the credit limit." } });
    expect(await saveSpendLimit(ID, 90000)).toEqual({ kind: "failed", message: "A spend limit can be at most the credit limit." });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    answer(401, { error: { code: "unauthorized", message: "Sign in to continue." } });
    expect(await saveSpendLimit(ID, 15000)).toEqual({ kind: "signed-out" });
  });
});
