import { afterEach, describe, expect, it, vi } from "vitest";

import { OFFLINE_MESSAGE } from "./client";
import { loadDenialReason, saveDenialReason } from "./denial-reason";

const ID = "00000000-0000-4000-8000-000000000001";

const detail = (denialReason: string | null, denialReasonNote: string | null = null) => ({
  id: ID,
  cardId: "discover-it-student-cash-back",
  cardName: "Discover it Student Cash Back",
  status: "rejected",
  creditLimitCents: null,
  appliedAt: null,
  statusUpdatedAt: "2026-10-24T12:00:00Z",
  denialReason,
  denialReasonNote,
  autopayStatus: "unknown",
  statementClosingDay: null,
  paymentDueDay: null,
});

function answer(status: number, body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const sentBody = (fetchFn: ReturnType<typeof answer>) => JSON.parse(String(fetchFn.mock.calls[0][1]?.body));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveDenialReason", () => {
  it("patches the reason and the trimmed note for Something else", async () => {
    const fetchFn = answer(200, detail("something_else", "Too many recent applications"));
    expect(await saveDenialReason(ID, "something_else", "  Too many recent applications ")).toEqual({ kind: "ok" });
    expect(fetchFn.mock.calls[0][0]).toBe(`/api/v1/applications/${ID}`);
    expect(fetchFn.mock.calls[0][1]?.method).toBe("PATCH");
    expect(sentBody(fetchFn)).toEqual({ denialReason: "something_else", denialReasonNote: "Too many recent applications" });
  });

  it("saves no note when the box is empty, and clears it for any other reason", async () => {
    let fetchFn = answer(200, detail("something_else"));
    await saveDenialReason(ID, "something_else", "   ");
    expect(sentBody(fetchFn)).toEqual({ denialReason: "something_else", denialReasonNote: null });
    fetchFn = answer(200, detail("income"));
    await saveDenialReason(ID, "income", "typed before switching");
    expect(sentBody(fetchFn)).toEqual({ denialReason: "income", denialReasonNote: null });
    fetchFn = answer(200, detail("no_letter_yet"));
    await saveDenialReason(ID, "no_letter_yet");
    expect(sentBody(fetchFn)).toEqual({ denialReason: "no_letter_yet", denialReasonNote: null });
  });

  it("cuts the note to 200 characters, the API's limit", async () => {
    const fetchFn = answer(200, detail("something_else"));
    await saveDenialReason(ID, "something_else", "a".repeat(250));
    expect(sentBody(fetchFn).denialReasonNote).toHaveLength(200);
  });

  it("says signed-out on 401 and passes on the API's message or the offline line", async () => {
    answer(401, { error: { code: "unauthorized", message: "Sign in to continue." } });
    expect(await saveDenialReason(ID, "income")).toEqual({ kind: "signed-out" });
    answer(400, { error: { code: "invalid_request", message: "Only a denied application can have a denial reason." } });
    expect(await saveDenialReason(ID, "income")).toEqual({
      kind: "failed",
      message: "Only a denied application can have a denial reason.",
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await saveDenialReason(ID, "income")).toEqual({ kind: "failed", message: OFFLINE_MESSAGE });
  });
});

describe("loadDenialReason", () => {
  it("reads the saved reason and note", async () => {
    const fetchFn = answer(200, detail("something_else", "Too many recent applications"));
    expect(await loadDenialReason(ID)).toEqual({ reason: "something_else", note: "Too many recent applications" });
    expect(fetchFn.mock.calls[0][1]?.method).toBe("GET");
  });

  it("returns null when no reason is saved or the read fails", async () => {
    answer(200, detail(null));
    expect(await loadDenialReason(ID)).toBeNull();
    answer(503, { error: { code: "data_unavailable", message: "Your data is temporarily unavailable. Please try again." } });
    expect(await loadDenialReason(ID)).toBeNull();
  });
});
