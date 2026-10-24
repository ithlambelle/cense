import { findCard } from "@/lib/cards/catalog";
import { moneyAmount } from "@/lib/money";
import { ROUTES } from "@/lib/routes";

import { addDays, nextOnDay, payDownTargetCents } from "./schedule";

// The reminder emails, one per kind, from the reminder copy (draft 2, Oct 24).
// Short on purpose. No live balance anywhere: Cense does not have one yet.
// Every email ends with the reminder settings and unsubscribe links. Buttons
// open the app, where the same reminder waits with its actions; no link
// carries anything about the student except the signed unsubscribe token.

export type ReminderEmailKind = "statement_closing" | "payment_due" | "check_autopay" | "reapply";

export type ReminderEmailInput = {
  kind: ReminderEmailKind;
  // The date the reminder is about (YYYY-MM-DD): the closing, due, first
  // statement or reapply date.
  occurrence: string;
  cardId: string | null;
  cardName: string | null;
  creditLimitCents: number | null;
  autopayStatus: string;
  paymentDueDay: number | null;
};

export type ReminderEmailLinks = {
  // The app's address, for example https://censefinance.com (no trailing slash).
  appUrl: string;
  unsubscribeUrl: string;
};

export type ReminderEmail = { subject: string; html: string; text: string };

const BUREAUS_URL = "https://www.experian.com/blogs/ask-experian/credit-card-balance-vs-utilization/";
const SIGN_OFF = "Penny ;)";

// Why the student is getting it, in the footer.
const WHY: Record<ReminderEmailKind, string> = {
  statement_closing: "statement reminders are on",
  payment_due: "payment reminders are on",
  check_autopay: "autopay reminders are on",
  reapply: "you set a reapply reminder",
};

// A calendar date as "Fri" or "Fri, Nov 12". The date is already on the
// student's calendar, so it is formatted as is, never shifted.
function weekday(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Text in the email, kept as plain text and HTML side by side. HTML parts
// are built only from escaped values.
type Part =
  | { type: "p"; text: string; html: string }
  | { type: "list"; items: { text: string; html: string }[] }
  | { type: "buttons"; labels: string[] };

const p = (text: string, html = escapeHtml(text)): Part => ({ type: "p", text, html });
const b = (value: string) => `<strong>${escapeHtml(value)}</strong>`;

type Content = { subject: string; preview: string; parts: Part[] };

function content(input: ReminderEmailInput): Content {
  const catalogCard = input.cardId ? findCard(input.cardId) : undefined;
  const card = input.cardName ?? catalogCard?.name ?? "card";
  const issuerApp = catalogCard ? `your ${catalogCard.brand} app` : "your card's app";
  const day = weekday(input.occurrence);
  const date = longDate(input.occurrence);

  switch (input.kind) {
    case "statement_closing": {
      const target = input.creditLimitCents ? moneyAmount(payDownTargetCents(input.creditLimitCents)) : null;
      const tail = "Bureaus love a low number like a retriever loves a tennis ball.";
      return {
        subject: `Your statement closes ${day}. Quick move?`,
        preview: target ? `Pay down to ${target} first. Your score says thanks.` : "Pay it down first. Your score says thanks.",
        parts: [
          p("Hey,"),
          p(
            `Your ${card} statement closes ${date}. Whatever you owe that day is usually what the credit bureaus see (${BUREAUS_URL}).`,
            `Your ${escapeHtml(card)} statement closes ${escapeHtml(date)}. Whatever you owe that day is <a href="${BUREAUS_URL}">usually what the credit bureaus see</a>.`,
          ),
          target
            ? p(
                `So pay it down to ${target} or less in ${issuerApp} before then. ${tail}`,
                `So pay it down to ${b(`${target} or less`)} in ${escapeHtml(issuerApp)} before then. ${escapeHtml(tail)}`,
              )
            : p(`So pay it down in ${issuerApp} before then. ${tail}`),
          { type: "buttons", labels: ["I paid it down"] },
        ],
      };
    }
    case "payment_due": {
      if (input.autopayStatus === "on") {
        return {
          subject: `Due ${day}. Autopay's got it.`,
          preview: "Just make sure checking can cover it.",
          parts: [
            p(`Your ${card} payment is due ${date}. Autopay pays the full balance, so just make sure checking can cover it. Autopay with an empty account is a vending machine with no snacks.`),
            { type: "buttons", labels: ["Looks good"] },
          ],
        };
      }
      return {
        subject: `Your payment's due ${day}`,
        preview: "Pay the full statement balance and interest gets $0.",
        parts: [
          p(`Your ${card} payment is due ${date}. Pay the full statement balance and interest gets $0. Short this month? Pay at least the minimum to dodge the late fee.`),
          { type: "buttons", labels: ["I paid it", "Turn on autopay"] },
        ],
      };
    }
    case "check_autopay": {
      // The first payment due after the first statement closes.
      const due = input.paymentDueDay ? longDate(nextOnDay(input.paymentDueDay, addDays(input.occurrence, 1))) : "the due date";
      const balance = `pay it in full by ${due} and you pay $0 interest.`;
      const minimum = "dodges the late fee, but interest hits the rest. Tempting? Yes. Smart? NO.";
      return {
        subject: "Your first statement is here. Let's make Cense of it.",
        preview: "Two numbers matter.",
        parts: [
          p(`Hey, your ${card} just sent its first statement. Two numbers matter:`),
          {
            type: "list",
            items: [
              { text: `Statement balance: ${balance}`, html: `${b("Statement balance:")} ${escapeHtml(balance)}` },
              { text: `Minimum payment: ${minimum}`, html: `${b("Minimum payment:")} ${escapeHtml(minimum)}` },
            ],
          },
          p("Is autopay set to the full statement balance?"),
          { type: "buttons", labels: ["Yep", "Not yet"] },
        ],
      };
    }
    case "reapply":
      // Not in the copy note yet: placeholder wording for Ben to replace.
      return {
        subject: "Today's the day you picked to reapply",
        preview: "Check your plan first. It takes a minute.",
        parts: [
          p(`You asked us to check in today about reapplying for ${card}. Check your plan first. It takes a minute.`),
          { type: "buttons", labels: ["Open my plan"] },
        ],
      };
  }
}

const STYLE = {
  body: "margin:0;padding:24px 16px;background:#ffffff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;",
  button: "display:inline-block;margin:0 8px 8px 0;padding:10px 18px;border-radius:999px;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600;",
  footer: "margin-top:32px;color:#6b6b6b;font-size:13px;",
  footerLink: "color:#6b6b6b;",
};

export function buildReminderEmail(input: ReminderEmailInput, links: ReminderEmailLinks): ReminderEmail {
  const { subject, preview, parts } = content(input);
  const appLink = `${links.appUrl}${ROUTES.home}`;
  const settingsLink = `${links.appUrl}${ROUTES.settings}`;
  const footerText = `You're getting this because ${WHY[input.kind]}.`;

  const textParts = parts.map((part) => {
    if (part.type === "p") return part.text;
    if (part.type === "list") return part.items.map((item) => `- ${item.text}`).join("\n");
    return part.labels.map((label) => `${label}: ${appLink}`).join("\n");
  });
  const text = [
    ...textParts,
    SIGN_OFF,
    `${footerText}\nReminder settings: ${settingsLink}\nUnsubscribe: ${links.unsubscribeUrl}`,
  ].join("\n\n");

  const htmlParts = parts.map((part) => {
    if (part.type === "p") return `<p>${part.html}</p>`;
    if (part.type === "list") return `<ul>${part.items.map((item) => `<li>${item.html}</li>`).join("")}</ul>`;
    return `<p>${part.labels.map((label) => `<a href="${escapeHtml(appLink)}" style="${STYLE.button}">${escapeHtml(label)}</a>`).join("")}</p>`;
  });
  const html = [
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="${STYLE.body}">`,
    // the inbox preview line, hidden in the email itself
    `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>`,
    `<div style="max-width:480px;margin:0 auto;">`,
    ...htmlParts,
    `<p>${escapeHtml(SIGN_OFF)}</p>`,
    `<p style="${STYLE.footer}">${escapeHtml(footerText)} <a href="${escapeHtml(settingsLink)}" style="${STYLE.footerLink}">Reminder settings</a> · <a href="${escapeHtml(links.unsubscribeUrl)}" style="${STYLE.footerLink}">Unsubscribe</a></p>`,
    `</div></body></html>`,
  ].join("");

  return { subject, html, text };
}
