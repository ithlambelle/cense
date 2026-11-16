import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

const penny = vi.hoisted(() => ({ askPenny: vi.fn(), configured: true }));
vi.mock("@/lib/penny/ask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/penny/ask")>();
  return { ...actual, askPenny: penny.askPenny, pennyConfigured: () => penny.configured };
});
vi.mock("server-only", () => ({}));
const service = vi.hoisted(() => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => service);

import { POST } from "./route";

type Rpc = { data: unknown; error: { code?: string; message: string } | null };

// claim_penny_ask, called with the service role for the student in the
// session (20261117110000_security_quotas.sql), answers `claim`. `legacy` is
// what the old claim, called as the student, answers before that migration.
// Each call is recorded as "<client> <function> <arguments>".
function student(claim: Rpc = { data: "ok", error: null }, legacy: Rpc = { data: null, error: { message: "not expected" } }) {
  const calls: string[] = [];
  const supabase = {
    rpc: async (name: string, args?: unknown) => {
      calls.push(`student ${name} ${JSON.stringify(args ?? {})}`);
      return legacy;
    },
  };
  service.createServiceClient.mockReturnValue({
    rpc: async (name: string, args?: unknown) => {
      calls.push(`service ${name} ${JSON.stringify(args ?? {})}`);
      return claim;
    },
  });
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return calls;
}

const CLAIMED = `service claim_penny_ask ${JSON.stringify({ p_student_id: "student-1" })}`;

const ask = (body: unknown) => POST(new Request("http://test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

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
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"); // gitleaks:allow
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  service.createServiceClient.mockReset();
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
    expect(calls).toEqual([CLAIMED]);
    expect(service.createServiceClient).toHaveBeenCalledWith("test-service-role-key");
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

  it("never takes the student to count from the request", async () => {
    const calls = student();
    expect((await ask({ question: "What is a credit score?", p_student_id: "someone-else" })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("says Penny is unavailable without the service role key, and counts nothing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const calls = student();
    const response = await ask({ question: "What is a credit score?" });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("penny_unavailable");
    expect(calls).toEqual([]);
    expect(service.createServiceClient).not.toHaveBeenCalled();
    expect(penny.askPenny).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "penny_not_configured", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }));
  });

  it("falls back to the old claim until the migration is applied", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const calls = student({ data: null, error: { code: "PGRST202", message: "no such function" } }, { data: "student_limit", error: null });
    const response = await ask({ question: "What is a credit score?" });
    expect(response.status).toBe(429);
    expect(calls).toEqual([CLAIMED, "student claim_penny_ask {}"]);
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
