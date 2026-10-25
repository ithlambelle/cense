import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const service = vi.hoisted(() => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => service);

import { unsubscribeToken } from "@/lib/reminders/unsubscribe-token";

import { GET, POST } from "./route";

const SECRET = "test-unsubscribe-secret"; // gitleaks:allow
const STUDENT = "00000000-0000-4000-8000-0000000000aa";
const TOKEN = unsubscribeToken(STUDENT, SECRET);
const url = (token: string | null = TOKEN) => `https://app.test/api/v1/reminders/unsubscribe${token === null ? "" : `?token=${token}`}`;

function database(result: { error: { code?: string; message: string } | null } = { error: null }) {
  const calls: { name: string; args: unknown }[] = [];
  service.createServiceClient.mockReturnValue({
    rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return { data: true, ...result }; },
  });
  return calls;
}

beforeEach(() => {
  vi.stubEnv("REMINDER_UNSUBSCRIBE_SECRET", SECRET);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"); // gitleaks:allow
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  service.createServiceClient.mockReset();
});

describe("/reminders/unsubscribe", () => {
  it("GET only shows a confirm button, so a mail scanner opening the link changes nothing", async () => {
    const calls = database();
    const response = await GET(new Request(url()));
    expect(response.status).toBe(200);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const html = await response.text();
    expect(html).toContain('method="post"');
    expect(html).toContain(`?token=${encodeURIComponent(TOKEN)}`);
    expect(calls).toEqual([]);
  });

  it("POST (the button or one-click) unsubscribes the student in the token", async () => {
    const calls = database();
    const response = await POST(new Request(url(), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("You're unsubscribed");
    expect(calls).toEqual([{ name: "unsubscribe_reminders", args: { p_student_id: STUDENT } }]);
  });

  it("refuses a tampered, missing or foreign token without touching the database", async () => {
    const calls = database();
    const other = "00000000-0000-4000-8000-0000000000bb";
    const forged = `${other}.${TOKEN.split(".")[1]}`;
    for (const token of [forged, null, "nonsense", unsubscribeToken(STUDENT, "another-secret")]) {
      expect((await GET(new Request(url(token)))).status).toBe(400);
      expect((await POST(new Request(url(token), { method: "POST" }))).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("reports a database error and a missing secret", async () => {
    database({ error: { code: "PGRST000", message: "down" } });
    expect((await POST(new Request(url(), { method: "POST" }))).status).toBe(503);
    vi.stubEnv("REMINDER_UNSUBSCRIBE_SECRET", "");
    expect((await GET(new Request(url()))).status).toBe(500);
    expect((await POST(new Request(url(), { method: "POST" }))).status).toBe(500);
  });
});
