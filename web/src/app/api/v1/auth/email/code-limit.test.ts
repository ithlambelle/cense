// Created with Claude Code (2026-11-26). The sign-in code limit end to end
// through the routes and the real lib/auth/throttle.ts, with a stand-in for
// the database's counting (auth_code_check() in
// 20261126140000_sign_in_code_checks.sql, tested for real in
// sign_in_code_checks.test.sql): 5 tries per code, parallel guesses held to
// 5, a new code starting the count again, and the per-IP wrong-code limit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ verifyOtp: vi.fn(), signInWithOtp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createStudentClient: async () => ({ auth }) }));

// The database: rows per bucket and key, counted and written in one step after
// a random wait, as the real function does under its locks. The time limits
// (claim_auth_attempt_hashed) always let the try through here.
const db = vi.hoisted(() => {
  const rows: { bucket: string; key: string }[] = [];
  const pause = () => new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
  const countOf = (bucket: string, key: string | null) => rows.filter((row) => row.bucket === bucket && row.key === key).length;
  async function run(fn: string, args: Record<string, string | null>) {
    await pause();
    if (fn === "claim_auth_attempt_hashed") return { data: 0, error: null };
    const { p_step: step, p_email_hash: email, p_ip_hash: ip } = args;
    if (step === "new_code") {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].bucket === "code:email:day" && rows[i].key === email) rows.splice(i, 1);
      return { data: 0, error: null };
    }
    if (step === "passed") {
      const at = rows.map((row) => row.bucket === "code:ip" && row.key === ip).lastIndexOf(true);
      if (at >= 0) rows.splice(at, 1);
      return { data: 0, error: null };
    }
    if (ip && countOf("code:ip", ip) >= 30) return { data: 540, error: null };
    if (email && countOf("code:email:day", email) >= 5) return { data: -1, error: null };
    if (email) rows.push({ bucket: "code:email:day", key: email });
    if (ip) rows.push({ bucket: "code:ip", key: ip });
    return { data: 0, error: null };
  }
  return {
    rows,
    client: { rpc: (fn: string, args: Record<string, string | null>) => ({ abortSignal: () => run(fn, args) }) },
  };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db.client }));

import { POST as sendCode } from "./route";
import { POST as verify } from "./verify/route";

const WRONG = { data: { user: null }, error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired") };
const RIGHT = { data: { user: { email_confirmed_at: "2026-10-01T09:00:00Z", last_sign_in_at: "2026-11-26T09:00:00Z" } }, error: null };

function post(path: string, body: unknown, ip = "203.0.113.7"): Request {
  return new Request(`https://censefinance.com/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}
const check = (email: string, ip?: string) => verify(post("/auth/email/verify", { email, code: "000000" }, ip));

beforeEach(() => {
  db.rows.length = 0;
  // On Vercel, so the IP is trusted (lib/auth/throttle.ts clientIp).
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("AUTH_THROTTLE_KEY", "a-random-secret-of-at-least-32-characters");
  auth.verifyOtp.mockReset().mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
    return WRONG;
  });
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

async function codes(responses: Response[]) {
  return Promise.all(responses.map(async (response) => `${response.status} ${(await response.json()).error?.code ?? "ok"}`));
}

describe("the sign-in code limit", () => {
  it("lets 5 wrong codes reach Supabase, then refuses that code, even the right one, in plain words", async () => {
    const answers = [];
    for (let i = 0; i < 6; i++) answers.push(await check("ana@example.com"));
    expect(await codes(answers)).toEqual([...Array(5).fill("401 invalid_code"), "401 code_used_up"]);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(5);

    auth.verifyOtp.mockResolvedValue(RIGHT);
    const right = await check("ana@example.com");
    expect(right.status).toBe(401);
    expect((await right.json()).error).toEqual({ code: "code_used_up", message: "Too many wrong codes. Tap Resend email for a new one." });
    expect(auth.verifyOtp).toHaveBeenCalledTimes(5);
  });

  it("holds 50 parallel guesses to 5 checks", async () => {
    const answers = await codes(await Promise.all(Array.from({ length: 50 }, () => check("ana@example.com"))));
    expect(auth.verifyOtp).toHaveBeenCalledTimes(5);
    expect(answers.filter((answer) => answer === "401 invalid_code")).toHaveLength(5);
    expect(answers.filter((answer) => answer === "401 code_used_up")).toHaveLength(45);
  });

  it("counts the email whatever the address, so guesses from many addresses share 5 tries", async () => {
    for (let i = 0; i < 5; i++) await check("ana@example.com", `198.51.100.${i + 1}`);
    expect((await (await check("Ana+x@Example.com", "192.0.2.1")).json()).error.code).toBe("code_used_up");
  });

  it("gives a new code 5 tries again once it is sent, and the right code then signs in", async () => {
    for (let i = 0; i < 6; i++) await check("ana@example.com");
    expect((await sendCode(post("/auth/email", { email: "ana@example.com" }))).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await check("ana@example.com")).status).toBe(401);
    auth.verifyOtp.mockResolvedValue(RIGHT);
    expect(await (await check("ana@example.com")).json()).toEqual({ status: "signed_in" });
  });

  it("keeps the dead code dead when Supabase refuses to send a new one", async () => {
    for (let i = 0; i < 5; i++) await check("ana@example.com");
    auth.signInWithOtp.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    expect((await sendCode(post("/auth/email", { email: "ana@example.com" }))).status).toBe(502);
    expect((await (await check("ana@example.com")).json()).error.code).toBe("code_used_up");
  });

  it("stops one address after 30 wrong codes across many emails, but not a room of students with right codes", async () => {
    for (let i = 0; i < 30; i++) await check(`spray${i}@example.com`);
    const limited = await check("spray30@example.com");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("540");
    expect(auth.verifyOtp).toHaveBeenCalledTimes(30);

    auth.verifyOtp.mockResolvedValue(RIGHT);
    for (let i = 0; i < 40; i++) expect((await check(`room${i}@example.com`, "192.0.2.9")).status, `student ${i}`).toBe(200);
  });
});
