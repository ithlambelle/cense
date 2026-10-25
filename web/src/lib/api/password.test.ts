import { describe, expect, it } from "vitest";

import { openedResetLink, RESET_SESSION_SECONDS } from "./password";

const NOW = 1_800_000_000;
const SENT = new Date((NOW - 120) * 1000).toISOString();

describe("openedResetLink", () => {
  it("accepts a session the app's reset link opened (Supabase calls it otp) after the reset email", () => {
    expect(openedResetLink([{ method: "otp", timestamp: NOW - 60 }], SENT, NOW)).toBe(true);
    // The same second the email went out counts.
    expect(openedResetLink([{ method: "otp", timestamp: NOW - 120 }], SENT, NOW)).toBe(true);
  });

  it("refuses an email-code session that began before the reset email", () => {
    expect(openedResetLink([{ method: "otp", timestamp: NOW - 121 }], SENT, NOW)).toBe(false);
  });

  it("refuses an email-code session when no reset email was sent", () => {
    expect(openedResetLink([{ method: "otp", timestamp: NOW }], null, NOW)).toBe(false);
    expect(openedResetLink([{ method: "otp", timestamp: NOW }], undefined, NOW)).toBe(false);
  });

  it("accepts Supabase's own recovery session", () => {
    expect(openedResetLink([{ method: "recovery", timestamp: NOW - 10 }], null, NOW)).toBe(true);
  });

  it("refuses any session older than the hour a link lasts", () => {
    const old = NOW - RESET_SESSION_SECONDS - 1;
    expect(openedResetLink([{ method: "recovery", timestamp: old }], SENT, NOW)).toBe(false);
    expect(openedResetLink([{ method: "otp", timestamp: old }], new Date((old - 5) * 1000).toISOString(), NOW)).toBe(false);
  });

  it("refuses password and Google sign-ins, and anything malformed", () => {
    expect(openedResetLink([{ method: "password", timestamp: NOW }], SENT, NOW)).toBe(false);
    expect(openedResetLink([{ method: "oauth", timestamp: NOW }], SENT, NOW)).toBe(false);
    expect(openedResetLink([{ method: "recovery" }], SENT, NOW)).toBe(false);
    expect(openedResetLink(["recovery"], SENT, NOW)).toBe(false);
    expect(openedResetLink(null, SENT, NOW)).toBe(false);
    expect(openedResetLink("recovery", SENT, NOW)).toBe(false);
  });

  it("accepts when any one entry qualifies, as after a step-up", () => {
    expect(openedResetLink([{ method: "password", timestamp: NOW - 5000 }, { method: "otp", timestamp: NOW - 5 }], SENT, NOW)).toBe(true);
  });
});
