import { captureServer } from "@/lib/analytics-server";
import { reminderSettings } from "@/lib/reminders/config";
import { verifyUnsubscribeToken } from "@/lib/reminders/unsubscribe-token";
import { ROUTES } from "@/lib/routes";
import { createServiceClient } from "@/lib/supabase/service";

// The unsubscribe link in every reminder email (?token=<signed student id>,
// see lib/reminders/unsubscribe-token.ts). The student is not signed in, so
// the signed token is what proves who they are.
//
// GET only shows a page with a button: mail scanners open links on their
// own, and that must never unsubscribe anyone. POST unsubscribes: the
// button, or the inbox's own one-click unsubscribe (RFC 8058, the
// List-Unsubscribe-Post header). It uses the service role, the narrow
// exception in api/data-contract.md, for unsubscribe_reminders() only.

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  // the token is in this page's address: never send it on as a referrer
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
};

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>`
    + `<body style="margin:0;padding:48px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;background:#fff;">`
    + `<main style="max-width:420px;margin:0 auto;"><h1 style="font-size:22px;">${title}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}

const BUTTON = "padding:10px 18px;border:0;border-radius:999px;background:#1a1a1a;color:#fff;font-size:16px;font-weight:600;cursor:pointer;";
const settingsLink = `<a href="${ROUTES.reminderSettings}" style="color:#1a1a1a;">Reminder settings</a>`;

const brokenLink = () => page(400, "This link doesn't work", `<p>Turn reminder emails off in ${settingsLink} instead.</p>`);

function token(request: Request): string | null {
  return new URL(request.url).searchParams.get("token");
}

function secret(): string | null {
  const config = reminderSettings(["unsubscribeSecret"]);
  if (config.ok) return config.settings.unsubscribeSecret;
  console.error(JSON.stringify({ event: "reminder_unsubscribe_not_configured", missing: config.missing }));
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const key = secret();
  if (!key) return page(500, "Something went wrong", `<p>Please try again later, or use ${settingsLink}.</p>`);
  const value = token(request);
  if (!verifyUnsubscribeToken(value, key)) return brokenLink();

  // the form posts back to this same address, token included
  return page(200, "Stop reminder emails?", `<p>You won't get any more reminder emails from Cense.</p>`
    + `<form method="post" action="?token=${encodeURIComponent(value!)}"><button type="submit" style="${BUTTON}">Unsubscribe</button></form>`);
}

export async function POST(request: Request): Promise<Response> {
  const config = reminderSettings(["unsubscribeSecret", "serviceRoleKey"]);
  if (!config.ok) {
    console.error(JSON.stringify({ event: "reminder_unsubscribe_not_configured", missing: config.missing }));
    return page(500, "Something went wrong", `<p>Please try again later, or use ${settingsLink}.</p>`);
  }
  const studentId = verifyUnsubscribeToken(token(request), config.settings.unsubscribeSecret);
  if (!studentId) return brokenLink();

  const supabase = createServiceClient(config.settings.serviceRoleKey);
  const { error } = await supabase.rpc("unsubscribe_reminders", { p_student_id: studentId });
  if (error) {
    console.error(JSON.stringify({ event: "database_error", operation: "reminder_unsubscribe", code: error.code }));
    return page(503, "Something went wrong", `<p>Please try again in a minute, or use ${settingsLink}.</p>`);
  }
  await captureServer([
    { event: "reminder_settings_changed", studentId, properties: { setting: "emails", on: false, source: "email_link" } },
  ]);
  return page(200, "You're unsubscribed", `<p>No more reminder emails. Changed your mind? Turn them back on in ${settingsLink}.</p>`);
}
