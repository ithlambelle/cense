import { describe, expect, it } from "vitest";

import { buildConfirmationEmail } from "./confirmation-email";

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
