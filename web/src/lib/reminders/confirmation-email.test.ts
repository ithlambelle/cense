import { describe, expect, it } from "vitest";

import { buildConfirmationEmail, buildPaymentRemindersEmail } from "./confirmation-email";

const APP = "00000000-0000-4000-8000-000000000001";
const links = { appUrl: "https://censefinance.com", unsubscribeUrl: "https://censefinance.com/api/v1/reminders/unsubscribe?token=t" };

describe("buildConfirmationEmail (F4)", () => {
  const email = buildConfirmationEmail({ applicationId: APP, remindOn: "2027-04-05" }, links);

  it("says the reminder is set and when, in the frame's words", () => {
    expect(email.subject).toBe("Your reapply reminder is set");
    expect(email.text).toContain("Hey, your reapply reminder is set. We'll email you on Apr 5, 2027, so you can check your plan before you reapply.");
    expect(email.text).toContain("Change the date any time in your plan.");
    expect(email.text).toContain("-Penny ;)");
  });

  it("has one button to the plan, and the settings and unsubscribe links", () => {
    expect(email.text).toContain(`Open your plan: https://censefinance.com/denied/plan?application=${APP}`);
    expect(email.html.match(/Open your plan/g)).toHaveLength(1);
    expect(email.html).toContain("https://censefinance.com/settings/reminders");
    expect(email.html).toContain(links.unsubscribeUrl);
    expect(email.text).toContain("You're getting this because you set a reapply reminder.");
  });

  it("never shifts the date across time zones", () => {
    expect(buildConfirmationEmail({ applicationId: APP, remindOn: "2027-01-01" }, links).text).toContain("Jan 1, 2027");
  });

  it("uses no em dashes and no tildes", () => {
    expect(email.text).not.toMatch(/[—~]/);
    expect(email.html).not.toMatch(/[—~]/);
  });
});

describe("buildPaymentRemindersEmail", () => {
  const base = {
    applicationId: APP, cardName: "Discover it Student Cash", today: "2026-11-09",
    statementClosing: { remindOn: "2026-11-09" }, paymentDue: { remindOn: "2026-12-04" }, autopayOn: false,
  };

  it("names the card and each reminder with the day it goes out, today said as today", () => {
    const email = buildPaymentRemindersEmail(base, links);
    expect(email.subject).toBe("Your payment reminders are set");
    expect(email.text).toContain("Hey, your reminders for Discover it Student Cash are set.");
    expect(email.text).toContain("We'll email you today, 3 days before your statement closes.");
    expect(email.text).toContain("We'll email you on Dec 4, 3 days before your payment is due.");
    expect(email.text).toContain(`See your reminders: https://censefinance.com/applications/${APP}/reminders`);
    expect(email.text).toContain("Unsubscribe: https://censefinance.com/api/v1/reminders/unsubscribe?token=t");
    expect(email.html).toContain("We&#39;ll email you on Dec 4");
  });

  it("says autopay covers the due date when it is on, and never promises an email that is off", () => {
    const autopay = buildPaymentRemindersEmail({ ...base, paymentDue: null, autopayOn: true }, links);
    expect(autopay.text).toContain("Autopay is on, so we won't email you about the due date.");
    expect(autopay.text).not.toContain("payment is due");

    const statementOff = buildPaymentRemindersEmail({ ...base, statementClosing: null }, links);
    expect(statementOff.text).not.toContain("statement closes");
    expect(statementOff.text).toContain("3 days before your payment is due");
  });

  it("calls an unnamed card your card", () => {
    expect(buildPaymentRemindersEmail({ ...base, cardName: null }, links).text).toContain("your reminders for your card are set");
  });
});
