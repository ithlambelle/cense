import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest, failureMessage, isUnauthorized } from "./client";

function fetchReturning(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("apiRequest", () => {
  it("sends JSON to the same origin with the session cookie and no caching", async () => {
    const fetchFn = fetchReturning(200, { status: "code_sent" });
    await apiRequest("post", "/auth/email", { body: { email: "a@b.co" }, fetchFn });

    expect(fetchFn).toHaveBeenCalledWith("/api/v1/auth/email", {
      signal: expect.any(AbortSignal),
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.co" }),
    });
  });

  it("sends no body or content type on a read", async () => {
    const fetchFn = fetchReturning(200, { answers: {}, updatedAt: "2026-10-11T00:00:00Z" });
    await apiRequest("get", "/quiz", { fetchFn });
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: "GET", headers: undefined, body: undefined });
  });

  it("fills and escapes path placeholders", async () => {
    const fetchFn = fetchReturning(200, {});
    await apiRequest("get", "/cards/{id}", { pathParams: { id: "a/b" }, fetchFn });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/cards/a%2Fb");
  });

  it("fails loudly when a path value is missing", async () => {
    await expect(apiRequest("get", "/cards/{id}", { fetchFn: fetchReturning(200, {}) })).rejects.toThrow("Missing path value");
  });

  it("gives up on a request that never answers and reports a network failure", async () => {
    vi.useFakeTimers();
    // Never answers by itself; rejects only when the request is aborted.
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const pending = apiRequest("get", "/quiz", { fetchFn });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ ok: false, kind: "network" });
  });

  it("reports a request cut off while its answer is being read as a network failure", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      // Headers arrive, then the body never does until the request is aborted.
      const body = new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
      return { ok: true, status: 200, json: () => body } as unknown as Response;
    });
    const pending = apiRequest("get", "/quiz", { fetchFn });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ ok: false, kind: "network" });
  });

  it("returns the data on success", async () => {
    const result = await apiRequest("post", "/auth/email", {
      body: { email: "a@b.co" },
      fetchFn: fetchReturning(200, { status: "code_sent" }),
    });
    expect(result).toEqual({ ok: true, data: { status: "code_sent" } });
  });

  it("returns the API's code and message on a named error", async () => {
    const result = await apiRequest("post", "/auth/email/verify", {
      body: { email: "a@b.co", code: "000000" },
      fetchFn: fetchReturning(401, { error: { code: "invalid_code", message: "The code is wrong or expired." } }),
    });
    expect(result).toEqual({
      ok: false,
      kind: "api",
      status: 401,
      code: "invalid_code",
      message: "The code is wrong or expired.",
    });
  });

  it("reports a network failure without throwing", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await apiRequest("get", "/quiz", { fetchFn })).toEqual({ ok: false, kind: "network" });
  });

  it("reports an answer that is not JSON as unexpected", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("<html>crash</html>", { status: 500 }));
    expect(await apiRequest("get", "/quiz", { fetchFn })).toEqual({ ok: false, kind: "unexpected", status: 500 });
  });

  it("reports an error body in the wrong shape as unexpected", async () => {
    const result = await apiRequest("get", "/quiz", { fetchFn: fetchReturning(500, { error: "boom" }) });
    expect(result).toEqual({ ok: false, kind: "unexpected", status: 500 });
  });
});

// Checked by the type checker, not at run time: each @ts-expect-error line
// fails `npm run typecheck` if the call below it ever starts to compile.
describe("apiRequest DELETE", () => {
  it("fills the path values and treats a 204 with no body as success", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const id = "00000000-0000-4000-8000-000000000001";
    const result = await apiRequest("delete", "/applications/{id}/plans/{plan}/steps/{step}", {
      pathParams: { id, plan: "first_month", step: "planned_purchase" },
      fetchFn,
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(fetchFn.mock.calls[0][0]).toBe(`/api/v1/applications/${id}/plans/first_month/steps/planned_purchase`);
    expect(fetchFn.mock.calls[0][1]?.method).toBe("DELETE");
  });
});

describe("apiRequest types", () => {
  it("only compiles calls the contract allows", () => {
    const fetchFn = fetchReturning(200, {});
    // @ts-expect-error a path the contract does not define
    void apiRequest("get", "/nope", { fetchFn });
    // @ts-expect-error a method this path does not define
    void apiRequest("post", "/quiz", { fetchFn });
    // @ts-expect-error a body is required where the contract declares one
    void apiRequest("put", "/quiz", { fetchFn });
    // @ts-expect-error a body is refused on a read
    void apiRequest("get", "/quiz", { fetchFn, body: {} });
    // @ts-expect-error an unknown answer key
    void apiRequest("put", "/quiz", { fetchFn, body: { answers: { age: 19 } } });
    // @ts-expect-error null is not an answer
    void apiRequest("put", "/quiz", { fetchFn, body: { answers: { under21: null } } });
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it("knows the shape of an answer", async () => {
    const result = await apiRequest("get", "/quiz", {
      fetchFn: fetchReturning(200, { answers: { under21: true }, updatedAt: "2026-10-11T00:00:00Z" }),
    });
    const under21: boolean | undefined = result.ok ? result.data.answers.under21 : undefined;
    expect(under21).toBe(true);
  });
});

describe("failures", () => {
  it("recognises a signed-out answer, and not a wrong code", () => {
    expect(isUnauthorized({ ok: false, kind: "api", status: 401, code: "unauthorized", message: "" })).toBe(true);
    expect(isUnauthorized({ ok: false, kind: "api", status: 401, code: "invalid_code", message: "" })).toBe(false);
    expect(isUnauthorized({ ok: false, kind: "network" })).toBe(false);
  });

  it("shows the API's message, a connection line, or a plain fallback", () => {
    expect(failureMessage({ ok: false, kind: "api", status: 502, code: "x", message: "We could not send a code." })).toBe(
      "We could not send a code.",
    );
    expect(failureMessage({ ok: false, kind: "network" })).toContain("connection");
    expect(failureMessage({ ok: false, kind: "unexpected", status: 500 })).not.toContain("500");
  });
});
