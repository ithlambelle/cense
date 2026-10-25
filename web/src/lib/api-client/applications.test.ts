import { afterEach, describe, expect, it, vi } from "vitest";

import { saveAutopay } from "./applications";

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
