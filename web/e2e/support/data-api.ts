// Calls Supabase's Data API directly with a signed-in student's own session,
// the way anyone holding their cookie could, skipping the app. The
// safe-to-spend journeys use it to prove row level security and the private
// schema hold: a student reads only their own rows and never a token.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BrowserContext } from "@playwright/test";

// The local stack's address and publishable key, from web/.env.local (CI
// writes it too; the tests run from web/). Refuses anything but the local stack.
function localStack(): { url: string; key: string } {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  const url = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(env)?.[1]?.trim();
  const key = /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)$/m.exec(env)?.[1]?.trim();
  if (!url || !key || new URL(url).hostname !== "127.0.0.1") throw new Error("web/.env.local must point at the local Supabase stack");
  return { url, key };
}

// The access token in the student's session cookie (one cookie, or numbered
// chunks, holding "base64-" plus base64url JSON).
async function accessToken(context: BrowserContext): Promise<string> {
  const chunks = (await context.cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()));
  if (chunks.length === 0) throw new Error("No Supabase session cookie found");
  const raw = decodeURIComponent(chunks.map((cookie) => cookie.value).join(""));
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8")) as { access_token: string };
  return session.access_token;
}

export type DataApiAnswer = { status: number; body: unknown };

// GET /rest/v1/{table} or POST /rest/v1/rpc/{fn} as the student. `schema`
// asks for a schema other than public (Accept-Profile).
export async function asStudent(
  context: BrowserContext,
  request: { table: string; schema?: string } | { rpc: string; args?: Record<string, unknown> },
): Promise<DataApiAnswer> {
  const { url, key } = localStack();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${await accessToken(context)}`,
    "Content-Type": "application/json",
  };
  const response =
    "table" in request
      ? await fetch(`${url}/rest/v1/${request.table}?select=*`, {
          headers: request.schema ? { ...headers, "Accept-Profile": request.schema } : headers,
        })
      : await fetch(`${url}/rest/v1/rpc/${request.rpc}`, { method: "POST", headers, body: JSON.stringify(request.args ?? {}) });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Kept as text.
  }
  return { status: response.status, body };
}
