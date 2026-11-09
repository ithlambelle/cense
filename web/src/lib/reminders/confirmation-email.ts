import { deniedPath, paymentRemindersPath, ROUTES } from "@/lib/routes";

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

const CONFIRMATION_SUBJECT = "Your reapply reminder is set";
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

// One confirmation email in the reminders' layout: a title, a few short
// lines, one button, and the footer with Reminder settings and Unsubscribe.
function renderConfirmation(
  content: { subject: string; lines: string[]; button: { label: string; href: string }; footer: string },
  links: ConfirmationEmailLinks,
): ConfirmationEmail {
  const { subject, lines, button, footer } = content;
  const settingsLink = `${links.appUrl}${ROUTES.reminderSettings}`;

  const text = [
    subject,
    ...lines,
    `${button.label}: ${button.href}`,
    `${footer}\nReminder settings: ${settingsLink}\nUnsubscribe: ${links.unsubscribeUrl}`,
  ].join("\n\n");

  const html = [
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="${STYLE.body}"><div style="max-width:480px;margin:0 auto;">`,
    `<h1 style="${STYLE.title}">${escapeHtml(subject)}</h1>`,
    ...lines.map((line) => `<p style="${STYLE.p}">${escapeHtml(line)}</p>`),
    `<p style="${STYLE.p}"><a href="${escapeHtml(button.href)}" style="${STYLE.button}">${escapeHtml(button.label)}</a></p>`,
    `<p style="${STYLE.footer}">${escapeHtml(footer)} <a href="${escapeHtml(settingsLink)}" style="${STYLE.footerLink}">Reminder settings</a> · <a href="${escapeHtml(links.unsubscribeUrl)}" style="${STYLE.footerLink}">Unsubscribe</a></p>`,
    `</div></body></html>`,
  ].join("");

  return { subject, html, text };
}

export function buildConfirmationEmail(input: ConfirmationEmailInput, links: ConfirmationEmailLinks): ConfirmationEmail {
  const date = shortDate(input.remindOn);
  return renderConfirmation(
    {
      subject: CONFIRMATION_SUBJECT,
      lines: [
        `Hey, your reapply reminder is set. We'll email you on ${date}, so you can check your plan before you reapply.`,
        "Change the date any time in your plan.",
        SIGN_OFF,
      ],
      button: { label: BUTTON_LABEL, href: `${links.appUrl}${deniedPath("plan", input.applicationId)}` },
      footer: FOOTER,
    },
    links,
  );
}

// The payment reminders' confirmation email, sent when a student sets or
// changes a card's statement and due days (Ben, 2026-11-09). It names each
// reminder that will go out and the day it goes, so the student knows what
// to expect. Like the reapply one, it is not a reminder row and does not count
// toward the one-email-a-day limit.

export type PaymentRemindersEmailInput = {
  applicationId: string;
  cardName: string | null;
  // Today on the student's calendar (YYYY-MM-DD).
  today: string;
  // The next reminder of each kind that is on, with the day it goes out; null
  // when that email is off. The due-date one is also null while autopay is on.
  statementClosing: { remindOn: string } | null;
  paymentDue: { remindOn: string } | null;
  autopayOn: boolean;
};

const PAYMENT_SUBJECT = "Your payment reminders are set";
const PAYMENT_BUTTON = "See your reminders";
const PAYMENT_FOOTER = "You're getting this because you set payment reminders.";

// "today" or "on Nov 9", on the student's calendar, never shifted.
function dayPhrase(date: string, today: string): string {
  if (date === today) return "today";
  return `on ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}`;
}

export function buildPaymentRemindersEmail(input: PaymentRemindersEmailInput, links: ConfirmationEmailLinks): ConfirmationEmail {
  const card = input.cardName ?? "your card";
  const lines = [`Hey, your reminders for ${card} are set.`];
  if (input.statementClosing) {
    lines.push(`We'll email you ${dayPhrase(input.statementClosing.remindOn, input.today)}, 3 days before your statement closes.`);
  }
  if (input.paymentDue) {
    lines.push(`We'll email you ${dayPhrase(input.paymentDue.remindOn, input.today)}, 3 days before your payment is due.`);
  } else if (input.autopayOn) {
    lines.push("Autopay is on, so we won't email you about the due date.");
  }
  lines.push("Change them any time in Cense.", SIGN_OFF);
  return renderConfirmation(
    {
      subject: PAYMENT_SUBJECT,
      lines,
      button: { label: PAYMENT_BUTTON, href: `${links.appUrl}${paymentRemindersPath(input.applicationId)}` },
      footer: PAYMENT_FOOTER,
    },
    links,
  );
}
