import { deniedPath, ROUTES } from "@/lib/routes";

// The reapply reminder's confirmation email (Flow F, F4, Figma 477:2704):
// sent once, right when the student saves the reminder, so "We emailed you a
// confirmation" on the saved screen is true. One line of news, one line about
// changing it, one button. It is not a reminder row: the daily job never sees
// it, so it does not count toward the one-email-a-day limit (open decision
// F4, built as drawn: it goes on save).

export type ConfirmationEmailInput = {
  applicationId: string;
  // The reminder's day on the student's calendar (YYYY-MM-DD).
  remindOn: string;
};

export type ConfirmationEmailLinks = {
  // The app's address, for example https://censefinance.com (no trailing slash).
  appUrl: string;
  unsubscribeUrl: string;
};

export type ConfirmationEmail = { subject: string; html: string; text: string };

export const CONFIRMATION_SUBJECT = "Your reapply reminder is set";
const BUTTON_LABEL = "Open your plan";
const SIGN_OFF = "-Penny ;)";
const FOOTER = "You're getting this because you set a reapply reminder.";

// "Apr 5, 2027". The date is already on the student's calendar, so it is
// formatted as is, never shifted.
function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// The frame's colors and sizes: Inter-like system type, a violet 16px-radius
// button, a 13px footer at 70%.
const STYLE = {
  body: "margin:0;padding:24px;background:#ffffff;color:#0f0b2e;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;",
  title: "margin:0 0 16px;color:#0a1045;font-size:20px;line-height:28px;font-weight:600;",
  p: "margin:0 0 16px;",
  button: "display:block;padding:16px 20px;border-radius:16px;background:#9740c5;color:#ffffff;text-decoration:none;font-size:17px;font-weight:600;",
  footer: "margin-top:32px;color:rgba(15,11,46,0.7);font-size:13px;line-height:18px;",
  footerLink: "color:rgba(15,11,46,0.7);",
};

export function buildConfirmationEmail(input: ConfirmationEmailInput, links: ConfirmationEmailLinks): ConfirmationEmail {
  const date = shortDate(input.remindOn);
  const lines = [
    `Hey, your reapply reminder is set. We'll email you on ${date}, so you can check your plan before you reapply.`,
    "Change the date any time in your plan.",
    SIGN_OFF,
  ];
  const planLink = `${links.appUrl}${deniedPath("plan", input.applicationId)}`;
  const settingsLink = `${links.appUrl}${ROUTES.reminderSettings}`;

  const text = [
    CONFIRMATION_SUBJECT,
    ...lines,
    `${BUTTON_LABEL}: ${planLink}`,
    `${FOOTER}\nReminder settings: ${settingsLink}\nUnsubscribe: ${links.unsubscribeUrl}`,
  ].join("\n\n");

  const html = [
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(CONFIRMATION_SUBJECT)}</title></head>`,
    `<body style="${STYLE.body}"><div style="max-width:480px;margin:0 auto;">`,
    `<h1 style="${STYLE.title}">${escapeHtml(CONFIRMATION_SUBJECT)}</h1>`,
    ...lines.map((line) => `<p style="${STYLE.p}">${escapeHtml(line)}</p>`),
    `<p style="${STYLE.p}"><a href="${escapeHtml(planLink)}" style="${STYLE.button}">${escapeHtml(BUTTON_LABEL)}</a></p>`,
    `<p style="${STYLE.footer}">${escapeHtml(FOOTER)} <a href="${escapeHtml(settingsLink)}" style="${STYLE.footerLink}">Reminder settings</a> · <a href="${escapeHtml(links.unsubscribeUrl)}" style="${STYLE.footerLink}">Unsubscribe</a></p>`,
    `</div></body></html>`,
  ].join("");

  return { subject: CONFIRMATION_SUBJECT, html, text };
}
