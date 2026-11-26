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
  { ...base, kind: "heard_back", occurrence: "2026-11-19", applicationId: "00000000-0000-4000-8000-000000000001" },
  { ...base, kind: "letter_check", occurrence: "2026-11-22", applicationId: "00000000-0000-4000-8000-000000000001" },
];
const APP = "00000000-0000-4000-8000-000000000001";

describe("buildReminderEmail", () => {
  it("every email has the unsubscribe and settings links, and no em dash, en dash or tilde", () => {
    for (const input of KINDS) {
      const email = buildReminderEmail(input, LINKS);
      for (const part of [email.html, email.text]) {
        expect(part).toContain(LINKS.unsubscribeUrl);
        // Reminder settings itself, not the account page (which had none)
        expect(part).toContain("https://app.test/settings/reminders");
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
    expect(email.text).toContain("Open Cense: https://app.test/updates?reminder=statement_closing");
  });

  it("statement closing: pays down to the spend limit the student saved, as Home does", () => {
    const email = buildReminderEmail({ ...base, creditLimitCents: 100_000, spendLimitCents: 80_000 }, LINKS);
    expect(email.html).toContain("Pay down to $800 first.");
    expect(email.text).toContain("pay it down to $800 or less in your Capital One app");
    expect(email.html).toContain("<strong>$800 or less</strong>");
    expect(email.text).not.toContain("$300");
  });

  it("has one button, Open Cense, to Home marked with the email's kind, and promises nothing it cannot do", () => {
    // The card reminders; the check-ins have their own buttons (below).
    for (const input of KINDS.filter((k) => k.kind !== "heard_back" && k.kind !== "letter_check")) {
      const email = buildReminderEmail(input, LINKS);
      const link = `https://app.test/updates?reminder=${input.kind}`;
      expect(email.text).toContain(`Open Cense: ${link}`);
      const buttons = [...email.html.matchAll(/<a href="([^"]+)" style="display:inline-block[^"]*">([^<]+)<\/a>/g)];
      expect(buttons.map(([, href, label]) => [href, label])).toEqual([[link, "Open Cense"]]);
      for (const part of [email.html, email.text]) {
        expect(part).not.toMatch(/I paid it|Yep|Not yet|Looks good|Turn on autopay:|Open my plan/);
      }
    }
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
    expect(off.text).toContain("Open Cense: https://app.test/updates?reminder=payment_due");
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

  it("heard back: three buttons that answer on the application's own screens, each counted", () => {
    const email = buildReminderEmail(KINDS[5], LINKS);
    expect(email.subject).toBe("Heard back yet?");
    expect(email.text).toContain("Has the issuer decided on your Savor Rewards for Students application?");
    const buttons = [...email.html.matchAll(/<a href="([^"]+)" style="display:inline-block[^"]*">([^<]+)<\/a>/g)].map(([, href, label]) => [label, href]);
    expect(buttons).toEqual([
      ["I was approved", `https://app.test/applications/${APP}?choice=approved&amp;reminder=heard_back`],
      ["I was denied", `https://app.test/applications/${APP}?choice=denied&amp;reminder=heard_back`],
      ["I haven&#39;t heard yet", `https://app.test/applications/${APP}/waiting?reminder=heard_back`],
    ]);
    expect(email.text).toContain(`I was approved: https://app.test/applications/${APP}?choice=approved&reminder=heard_back`);
    expect(email.text).toContain("You're getting this because application updates are on.");
    expect(email.text).not.toContain("Open Cense");
  });

  it("letter check: one button to the step that records the letter", () => {
    const email = buildReminderEmail(KINDS[6], LINKS);
    expect(email.subject).toBe("Has your letter come?");
    expect(email.text).toContain(`I got my letter: https://app.test/denied?application=${APP}&reminder=letter_check`);
    expect(email.text).toContain("Letters can take up to 30 days.");
  });

  it("a check-in without its application opens Updates instead", () => {
    const email = buildReminderEmail({ ...KINDS[5], applicationId: null }, LINKS);
    expect(email.text).toContain("Open Cense: https://app.test/updates?reminder=heard_back");
    expect(email.html).not.toContain("/applications/");
  });
});
