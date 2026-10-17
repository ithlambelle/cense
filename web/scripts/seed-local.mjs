// Dev only: seeds six test students into the LOCAL Supabase stack, one per
// Home state, through the app's own API (sign in by email code, save the quiz,
// track cards). No admin key is used. Run with the dev server on :3300:
//   node scripts/seed-local.mjs
// Sign-in codes are read from Mailpit, the local mail catcher. The emails are
// written to scripts/seed-students.local.json (git-ignored).
import { readFileSync, writeFileSync } from "node:fs";

const APP = process.env.SEED_APP_URL ?? "http://localhost:3300";
const MAILPIT = "http://127.0.0.1:54324";

// Refuse anything but the local stack, so this can never write to a hosted project.
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const supabaseUrl = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(env)?.[1]?.trim();
if (!supabaseUrl || new URL(supabaseUrl).hostname !== "127.0.0.1") {
  console.error(`Refusing to seed: NEXT_PUBLIC_SUPABASE_URL is ${supabaseUrl ?? "missing"}, not 127.0.0.1.`);
  process.exit(1);
}
if (!["localhost", "127.0.0.1"].includes(new URL(APP).hostname)) {
  console.error(`Refusing to seed: the app URL ${APP} is not local.`);
  process.exit(1);
}

const MATCH = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
const STUDENTS = [
  { key: "no-quiz" },
  { key: "matched", answers: MATCH },
  { key: "no-card", answers: { ...MATCH, incomeBand: "none" } },
  { key: "applied", answers: MATCH, card: { status: "applied" } },
  { key: "rejected", answers: MATCH, card: { status: "rejected" } },
  { key: "approved", answers: MATCH, card: { status: "approved", creditLimitCents: 50000 } },
];
const CARD = { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back" };

async function latestCode(email) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const message = list.messages?.[0];
    const code = message && /\b(\d{6})\b/.exec(message.Snippet ?? "")?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No code arrived for ${email}`);
}

async function api(cookie, method, path, body) {
  const response = await fetch(`${APP}/api/v1${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return response;
}

const run = Date.now().toString(36);
const seeded = {};
for (const student of STUDENTS) {
  const email = `seed-${student.key}-${run}@example.com`;
  await api(null, "POST", "/auth/email", { email });
  const verify = await api(null, "POST", "/auth/email/verify", { email, code: await latestCode(email) });
  const cookie = verify.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (student.answers) await api(cookie, "PUT", "/quiz", { answers: student.answers });
  if (student.card) {
    await api(cookie, "POST", "/applications", { ...CARD, status: student.card.status, creditLimitCents: student.card.creditLimitCents ?? null });
  }
  seeded[student.key] = email;
  console.log(`${student.key.padEnd(9)} ${email}`);
}
writeFileSync(new URL("./seed-students.local.json", import.meta.url), `${JSON.stringify(seeded, null, 2)}\n`);
