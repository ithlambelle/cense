import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

const penny = vi.hoisted(() => ({ askPenny: vi.fn(), configured: true }));
vi.mock("@/lib/penny/ask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/penny/ask")>();
  return { ...actual, askPenny: penny.askPenny, pennyConfigured: () => penny.configured };
});
vi.mock("server-only", () => ({}));

import { POST } from "./route";

type Rpc = { data: unknown; error: { code?: string; message: string } | null };

// The student's client: claim_penny_ask answers `claim`.
function student(claim: Rpc = { data: "ok", error: null }) {
  const calls: string[] = [];
  const supabase = {
    rpc: async (name: string) => {
      calls.push(name);
      return claim;
    },
  };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return calls;
}

const ask = (body: unknown) => POST(new Request("http://test", { method: "POST", body: JSON.stringify(body) }));

const ANSWER = {
  kind: "answer",
  text: "Checking preapproval won’t change your score.",
  answer: {
    id: "preapproval-vs-applying",
    question: "Preapproval vs. applying",
    topic: "credit",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-inquiry-en-1317/" },
  },
};

beforeEach(() => {
  penny.configured = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
  penny.askPenny.mockReset();
});

describe("POST /penny", () => {
  it("needs a session", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    const response = await ask({ question: "What is a credit score?" });
    expect(response.status).toBe(401);
    expect(penny.askPenny).not.toHaveBeenCalled();
  });

  it.each([{}, { question: "" }, { question: "   " }, { question: "x".repeat(301) }, { question: 3 }])("refuses %j", async (body) => {
    const calls = student();
    expect((await ask(body)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("answers, counting the question and sending it without personal details", async () => {
    const calls = student();
    penny.askPenny.mockResolvedValue(ANSWER);
    const response = await ask({ question: "Does preapproval hurt my score? I'm jordan@bu.edu" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(ANSWER);
    expect(calls).toEqual(["claim_penny_ask"]);
    expect(penny.askPenny).toHaveBeenCalledWith("Does preapproval hurt my score? I'm [removed]");
  });

  it("answers a crisis with the 988 line, without counting it or asking the model", async () => {
    const calls = student();
    const response = await ask({ question: "I want to die" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "declined", reason: "crisis", suggestions: [] });
    expect(calls).toEqual([]);
    expect(penny.askPenny).not.toHaveBeenCalled();
  });

  it("says Penny is unavailable without a key, and does not count the question", async () => {
    penny.configured = false;
    const calls = student();
    const response = await ask({ question: "What is a credit score?" });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("penny_unavailable");
    expect(calls).toEqual([]);
  });

  it.each(["student_limit", "daily_limit"])("stops at the %s", async (limit) => {
    student({ data: limit, error: null });
    const response = await ask({ question: "What is a credit score?" });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: "penny_limit", details: { limit } } });
    expect(penny.askPenny).not.toHaveBeenCalled();
  });

  it("reports a database error from the count", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student({ data: null, error: { code: "PGRST000", message: "down" } });
    expect((await ask({ question: "What is a credit score?" })).status).toBe(503);
    expect(penny.askPenny).not.toHaveBeenCalled();
  });

  it("says Penny is unavailable when the model fails, and logs no question text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    student();
    penny.askPenny.mockRejectedValue(new Error("boom"));
    const response = await ask({ question: "What is my secret question?" });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("penny_unavailable");
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "penny_failed", kind: "unexpected" }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret question");
  });
});
