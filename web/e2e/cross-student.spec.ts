// One student can never read or change another's data: not through the app's
// API, and not by going around it to the database with the public key and
// their own session, which any student can copy from their browser. Row level
// security (RLS) is the real barrier there. The README promised this test in
// CI before it existed (audit H-P1-06); it is the audit's idor.mjs, ported.
// Runs against the local Supabase stack only.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

import { codeFromMailpit, mailIds, uniqueEmail } from "./helpers";

const DISCOVER = { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back" };
const CHIME = { cardId: "chime-card", cardName: "Chime Card" };

// The stack the app uses (web/.env.local, or the shell), refused unless local,
// so this can never write to a hosted project.
function localSupabase(): { url: string; key: string } {
  let file = "";
  try {
    file = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  } catch {}
  const read = (name: string) => process.env[name] ?? new RegExp(`^${name}=(.*)$`, "m").exec(file)?.[1]?.trim();
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const key = read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and the publishable key in web/.env.local (README).");
  if (new URL(url).hostname !== "127.0.0.1") throw new Error(`Refusing to run: ${url} is not the local stack.`);
  return { url, key };
}

type Student = { id: string; api: APIRequestContext; db: SupabaseClient };

// Signs up through the app's own email code routes, as the browser does, then
// opens the database with the public key and that student's session.
async function student(label: string): Promise<Student> {
  const email = uniqueEmail(`rls-${label}`);
  const api = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL });
  const seen = await mailIds(email);
  expect((await api.post("/api/v1/auth/email", { data: { email } })).status()).toBe(200);
  const code = await codeFromMailpit(email, seen);
  expect((await api.post("/api/v1/auth/email/verify", { data: { email, code } })).status()).toBe(200);
  const me = await api.get("/api/v1/me");
  expect(me.status()).toBe(200);
  const { id } = (await me.json()) as { id: string };

  // @supabase/ssr keeps the session as "base64-" plus JSON, sometimes in chunks.
  const chunks = (await api.storageState()).cookies
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()));
  const raw = decodeURIComponent(chunks.map((cookie) => cookie.value).join("")).replace(/^base64-/, "");
  const { access_token: token } = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { access_token: string };
  const { url, key } = localSupabase();
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { id, api, db };
}

async function json<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  expect(response.ok(), `${response.url()} ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

test("a student cannot read or change another student's data, through the API or the database", async () => {
  const a = await student("a");
  const b = await student("b");
  const anon = createClient(localSupabase().url, localSupabase().key, { auth: { persistSession: false, autoRefreshToken: false } });

  // A: an approved card with its days saved (which schedules reminders), a
  // denied card, a first-month step, a denial step and a reapply reminder.
  const approved = (await json<{ id: string }>(await a.api.post("/api/v1/applications", { data: { ...DISCOVER, status: "approved", creditLimitCents: 50000 } }))).id;
  const rejected = (await json<{ id: string }>(await a.api.post("/api/v1/applications", { data: { ...CHIME, status: "rejected", creditLimitCents: null } }))).id;
  await json(await a.api.patch(`/api/v1/applications/${approved}`, { data: { statementClosingDay: 12, paymentDueDay: 9 } }));
  expect((await a.api.put(`/api/v1/applications/${approved}/plans/first_month/steps/planned_purchase`)).status()).toBe(201);
  expect((await a.api.put(`/api/v1/applications/${rejected}/plans/denial/steps/read_letter`)).status()).toBe(201);
  const remindOn = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  expect((await a.api.post("/api/v1/reminders", { data: { applicationId: rejected, remindOn } })).status()).toBe(201);
  const { reminders } = await json<{ reminders: { id: string }[] }>(await a.api.get("/api/v1/reminders"));
  expect(reminders.length).toBeGreaterThan(1);
  const reminder = reminders[0].id;
  // The owner is told it is not sent yet (409); anyone else must get 404.
  expect((await a.api.post(`/api/v1/reminders/${reminder}/acted`)).status()).toBe(409);

  // B, through the API, with A's ids: every one is not found.
  const attempts: [string, string, unknown?][] = [
    ["GET", `/api/v1/applications/${approved}`],
    ["PATCH", `/api/v1/applications/${approved}`, { status: "rejected" }],
    ["PATCH", `/api/v1/applications/${rejected}`, { denialReason: "income" }],
    ["GET", `/api/v1/applications/${approved}/plans/first_month`],
    ["GET", `/api/v1/applications/${rejected}/plans/denial`],
    ["PUT", `/api/v1/applications/${approved}/plans/first_month/steps/payment_reminder`],
    ["DELETE", `/api/v1/applications/${approved}/plans/first_month/steps/planned_purchase`],
    ["DELETE", `/api/v1/applications/${rejected}/plans/denial/steps/read_letter`],
    ["POST", "/api/v1/reminders", { applicationId: rejected, remindOn }],
    ["POST", `/api/v1/reminders/${reminder}/acted`],
  ];
  for (const [method, path, data] of attempts) {
    const response = await b.api.fetch(path, { method, data });
    expect(response.status(), `B ${method} ${path}`).toBe(404);
  }
  expect((await json<{ applications: unknown[] }>(await b.api.get("/api/v1/applications"))).applications).toEqual([]);
  expect((await json<{ reminders: unknown[] }>(await b.api.get("/api/v1/reminders"))).reminders).toEqual([]);

  // Signed out: every student route refuses. The reset body is made up at run
  // time and named, not written inline: secret scanners read an inline value
  // beside "password" as a hardcoded one.
  const madeUp = `not-signed-in-${Date.now()}`;
  const signedOut = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL });
  const studentRoutes: [string, string, unknown?][] = [
    ["GET", "/api/v1/applications"],
    ["POST", "/api/v1/applications", { cardId: null, cardName: "x", status: "applied", creditLimitCents: null }],
    ["GET", `/api/v1/applications/${approved}`],
    ["PATCH", `/api/v1/applications/${approved}`, { status: "applied" }],
    ["GET", `/api/v1/applications/${approved}/plans/first_month`],
    ["PUT", `/api/v1/applications/${approved}/plans/first_month/steps/payment_reminder`],
    ["DELETE", `/api/v1/applications/${approved}/plans/first_month/steps/planned_purchase`],
    ["GET", "/api/v1/reminders"],
    ["POST", "/api/v1/reminders", { applicationId: rejected, remindOn }],
    ["POST", `/api/v1/reminders/${reminder}/acted`],
    ["GET", "/api/v1/me"],
    ["GET", "/api/v1/me/reminder-settings"],
    ["PATCH", "/api/v1/me/reminder-settings", { emailsOn: false }],
    ["GET", "/api/v1/quiz"],
    ["PUT", "/api/v1/quiz", { answers: {} }],
    ["GET", "/api/v1/recommendations/latest"],
    ["POST", "/api/v1/issuer-clicks", { cardId: DISCOVER.cardId, kind: "apply" }],
    ["POST", "/api/v1/auth/password/reset/confirm", { password: madeUp }],
  ];
  for (const [method, path, data] of studentRoutes) {
    const response = await signedOut.fetch(path, { method, data });
    expect(response.status(), `signed out ${method} ${path}`).toBe(401);
  }
  await signedOut.dispose();

  // B, straight to the database: reads see none of A's rows, and writes to
  // A's rows touch nothing.
  for (const table of ["card_applications", "profiles", "quiz_drafts", "recommendations", "issuer_clicks", "reminders", "plan_steps"]) {
    const { data, error } = await b.db.from(table).select("student_id");
    expect(error, `B reads ${table}`).toBeNull();
    expect((data ?? []).filter((row) => row.student_id !== b.id), `B reads ${table}`).toEqual([]);
  }
  const none = async (label: string, query: PromiseLike<{ data: unknown[] | null; error: unknown }>) => {
    const { data, error } = await query;
    expect({ label, error, rows: data?.length ?? 0 }).toEqual({ label, error: null, rows: 0 });
  };
  await none("B reads A's card by id", b.db.from("card_applications").select("id").eq("id", approved));
  await none("B updates A's card", b.db.from("card_applications").update({ status: "rejected" }).eq("id", approved).select("id"));
  await none("B deletes A's card", b.db.from("card_applications").delete().eq("id", approved).select("id"));
  await none("B deletes A's plan step", b.db.from("plan_steps").delete().eq("card_application_id", approved).select("step"));
  await none("B marks A's reminder acted", b.db.from("reminders").update({ acted_at: new Date().toISOString() }).eq("id", reminder).select("id"));
  await none("B unsubscribes A", b.db.from("profiles").update({ reminders_unsubscribed_at: new Date().toISOString() }).eq("student_id", a.id).select("student_id"));

  const refused = async (label: string, query: PromiseLike<{ error: { code: string } | null }>, code: string) => {
    const { error } = await query;
    expect({ label, code: error?.code }).toEqual({ label, code });
  };
  await refused("B adds a card as A", b.db.from("card_applications").insert({ student_id: a.id, card_id: "x", card_name: "x", source: "added", status: "applied" }), "42501");
  await refused("B writes A's quiz", b.db.from("quiz_drafts").insert({ student_id: a.id, answers: {} }), "42501");
  await refused("B adds a step to A's card", b.db.from("plan_steps").insert({ student_id: b.id, card_application_id: approved, plan: "first_month", step: "payment_reminder" }), "23514");
  await refused("B sets a reapply reminder on A's card", b.db.rpc("create_reapply_reminder", { p_application_id: rejected, p_remind_on: remindOn }), "P0002");

  // The reminder job's functions are for the server's secret key only.
  const jobFunctions: [string, Record<string, unknown>][] = [
    ["claim_due_reminders", { p_limit: 5 }],
    ["refresh_all_reminders", {}],
    ["refresh_reminders", { p_application_id: approved }],
    ["unsubscribe_reminders", { p_student_id: a.id }],
    ["mark_reminder_sent", { p_reminder_id: reminder }],
    ["release_reminder_claim", { p_reminder_id: reminder }],
  ];
  for (const [name, args] of jobFunctions) {
    await refused(`B calls ${name}`, b.db.rpc(name, args), "42501");
    await refused(`signed out calls ${name}`, anon.rpc(name, args), "42501");
  }
  await refused("signed out sets a reapply reminder", anon.rpc("create_reapply_reminder", { p_application_id: rejected, p_remind_on: remindOn }), "42501");

  // Signed out, straight to the database: nothing of A's.
  for (const table of ["card_applications", "profiles", "quiz_drafts", "recommendations", "issuer_clicks", "reminders", "plan_steps"]) {
    const { data } = await anon.from(table).select("student_id");
    expect(data ?? [], `signed out reads ${table}`).toEqual([]);
  }

  // A's data is exactly as A left it.
  expect((await json<{ status: string }>(await a.api.get(`/api/v1/applications/${approved}`))).status).toBe("approved");
  expect((await json<{ denialReason: string | null }>(await a.api.get(`/api/v1/applications/${rejected}`))).denialReason).toBeNull();
  const firstMonth = await json<{ completedSteps: { step: string }[] }>(await a.api.get(`/api/v1/applications/${approved}/plans/first_month`));
  expect(firstMonth.completedSteps.map((s) => s.step)).toEqual(["planned_purchase"]);
  const denial = await json<{ completedSteps: { step: string }[] }>(await a.api.get(`/api/v1/applications/${rejected}/plans/denial`));
  expect(denial.completedSteps.map((s) => s.step)).toEqual(["read_letter"]);
  const after = await json<{ reminders: { id: string; actedAt: string | null }[] }>(await a.api.get("/api/v1/reminders"));
  expect(after.reminders.map((r) => r.id).sort()).toEqual(reminders.map((r) => r.id).sort());
  expect(after.reminders.find((r) => r.id === reminder)?.actedAt).toBeNull();
  expect((await json<{ emailsOn: boolean }>(await a.api.get("/api/v1/me/reminder-settings"))).emailsOn).toBe(true);

  await a.api.dispose();
  await b.api.dispose();
});
