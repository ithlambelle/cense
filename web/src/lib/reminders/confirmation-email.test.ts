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
    statementClosing: "2026-11-20", paymentDue: "2026-12-15", autopayCheck: false, autopayOn: false,
  };

  it("names the card, each reminder that is on and the card's next dates, never a send day", () => {
    const email = buildPaymentRemindersEmail(base, links);
    expect(email.subject).toBe("Your payment reminders are set");
    expect(email.text).toContain("Hey, your reminders for Discover it Student Cash are set.");
    expect(email.text).toContain("We'll email you before each statement closes, so you can pay it down. Next close: Nov 20.");
    expect(email.text).toContain("We'll email you before each payment is due. Next due date: Dec 15.");
    expect(email.text).not.toMatch(/today|3 days/);
    expect(email.text).toContain(`Change your reminders: https://censefinance.com/applications/${APP}/reminders`);
    expect(email.text).toContain("Unsubscribe: https://censefinance.com/api/v1/reminders/unsubscribe?token=t");
    expect(email.text).not.toMatch(/[—~]/);
    expect(email.html).not.toMatch(/[—~]/);
  });

  it("leaves out a next date that is today or past", () => {
    const email = buildPaymentRemindersEmail({ ...base, statementClosing: "2026-11-09" }, links);
    expect(email.text).toContain("We'll email you before each statement closes, so you can pay it down.\n");
    expect(email.text).not.toContain("Next close");
  });

  it("says autopay covers due dates when it is on, names the autopay check, and never promises an email that is off", () => {
    const autopay = buildPaymentRemindersEmail({ ...base, paymentDue: null, autopayOn: true }, links);
    expect(autopay.text).toContain("Autopay is on, so we won't email you about due dates.");
    expect(autopay.text).not.toContain("payment is due");

    const newCard = buildPaymentRemindersEmail({ ...base, autopayCheck: true }, links);
    expect(newCard.text).toContain("After your first statement, we'll email you to check autopay.");

    const statementOff = buildPaymentRemindersEmail({ ...base, statementClosing: null }, links);
    expect(statementOff.text).not.toContain("statement closes");
    expect(statementOff.text).toContain("before each payment is due");
  });

  it("calls an unnamed card your card, and escapes a card name in the HTML", () => {
    expect(buildPaymentRemindersEmail({ ...base, cardName: null }, links).text).toContain("your reminders for your card are set");
    const html = buildPaymentRemindersEmail({ ...base, cardName: "<script>x</script> & Co" }, links).html;
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt; &amp; Co");
    expect(html).not.toContain("<script>");
  });
});
