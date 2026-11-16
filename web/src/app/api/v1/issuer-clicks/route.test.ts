// Created with Claude Code (2026-11-17). POST /issuer-clicks never stops a
// student reaching the issuer: a click the database refuses (the daily
// limit) or cannot take is skipped, and the address still goes back.
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);
const catalog = vi.hoisted(() => ({
  catalogReady: () => true,
  findCard: (id: string) =>
    id === "sample-card"
      ? { id: "sample-card", applyUrl: "https://issuer.example/apply", preapprovalUrl: "https://issuer.example/preapproval" }
      : undefined,
}));
vi.mock("@/lib/cards/catalog", () => catalog);

import { POST } from "./route";

const ROW = { id: "00000000-0000-4000-8000-0000000000c1", clicked_at: "2026-11-17T12:00:00+00:00" };

function studentWhoseInsertAnswers(answer: { data: unknown; error: unknown }) {
  const query = { insert: () => query, select: () => query, single: async () => answer };
  return { supabase: { from: () => query }, studentId: "student-1", email: null };
}

function post(body: unknown) {
  return POST(new Request("http://localhost/api/v1/issuer-clicks", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("POST /issuer-clicks", () => {
  it("records the click and answers 201 with its id and time", async () => {
    auth.authenticatedStudent.mockResolvedValue(studentWhoseInsertAnswers({ data: ROW, error: null }));
    const response = await post({ cardId: "sample-card", kind: "apply" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: ROW.id, cardId: "sample-card", kind: "apply", url: "https://issuer.example/apply", clickedAt: ROW.clicked_at,
    });
  });

  it.each([["the daily limit", "54000"], ["a database that is down", "PGRST000"]])(
    "at %s, still answers the address, with no id, and logs only the code",
    async (_case, code) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      auth.authenticatedStudent.mockResolvedValue(studentWhoseInsertAnswers({ data: null, error: { code, message: "student-1 refused" } }));
      const response = await post({ cardId: "sample-card", kind: "preapproval" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: null, cardId: "sample-card", kind: "preapproval", url: "https://issuer.example/preapproval", clickedAt: null,
      });
      expect(warn).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "issuer_click_not_recorded", code }));
      expect(error).not.toHaveBeenCalled();
    },
  );
});
