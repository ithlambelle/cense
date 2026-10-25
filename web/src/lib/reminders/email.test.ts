import { describe, expect, it } from "vitest";

import { buildReminderEmail, type ReminderEmailInput } from "./email";

const LINKS = { appUrl: "https://app.test", unsubscribeUrl: "https://app.test/api/v1/reminders/unsubscribe?token=abc.def" };
const base: ReminderEmailInput = {
  kind: "statement_closing", occurrence: "2026-11-12", cardId: "capital-one-savor-students", cardName: null,
  creditLimitCents: 50_000, autopayStatus: "off", paymentDueDay: 9,
};
const KINDS: ReminderEmailInput[] = [
  base,
  { ...base, kind: "payment_due", occurrence: "2026-12-09" },
  { ...base, kind: "payment_due", occurrence: "2026-12-09", autopayStatus: "on" },
  { ...base, kind: "check_autopay" },
  { ...base, kind: "reapply", occurrence: "2027-04-16" },
];

describe("buildReminderEmail", () => {
  it("every email has the unsubscribe and settings links, and no em dash, en dash or tilde", () => {
    for (const input of KINDS) {
      const email = buildReminderEmail(input, LINKS);
      for (const part of [email.html, email.text]) {
        expect(part).toContain(LINKS.unsubscribeUrl);
        expect(part).toContain("https://app.test/settings");
      }
      for (const part of [email.subject, email.html, email.text]) expect(part).not.toMatch(/[\u2014\u2013\u007e]/);
    }
  });

  it("statement closing: the date, the issuer's app and 30% of the limit", () => {
    const email = buildReminderEmail(base, LINKS);
    expect(email.subject).toBe("Your statement closes Thu. Quick move?");
    expect(email.text).toContain("Your Savor Rewards for Students statement closes Thu, Nov 12.");
    expect(email.text).toContain("pay it down to $150 or less in your Capital One app");
    expect(email.html).toContain("<strong>$150 or less</strong>");
    expect(email.text).toContain("I paid it down: https://app.test/home");
  });

  it("statement closing with no limit leaves the figure out", () => {
    const email = buildReminderEmail({ ...base, creditLimitCents: null, cardId: null, cardName: "My CU Visa" }, LINKS);
    expect(email.text).not.toContain("$");
    expect(email.text).toContain("So pay it down in your card's app before then.");
  });

  it("payment due picks the autopay version", () => {
    expect(buildReminderEmail(KINDS[2], LINKS).subject).toBe("Due Wed. Autopay's got it.");
    const off = buildReminderEmail(KINDS[1], LINKS);
    expect(off.subject).toBe("Your payment's due Wed");
    expect(off.text).toContain("Turn on autopay: https://app.test/home");
  });

  it("first statement names the first due date after it closes", () => {
    // closes Nov 12, due day 9: the first payment is due Dec 9
    expect(buildReminderEmail(KINDS[3], LINKS).text).toContain("pay it in full by Wed, Dec 9");
  });

  it("escapes a card name the student typed", () => {
    const email = buildReminderEmail({ ...base, cardId: null, cardName: "<b>Evil</b> & Co" }, LINKS);
    expect(email.html).toContain("&lt;b&gt;Evil&lt;/b&gt; &amp; Co");
    expect(email.html).not.toContain("<b>Evil");
  });
});
