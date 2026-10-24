import { describe, expect, it } from "vitest";

import { confirmedByThisCode, unusablePassword } from "./confirmation";

describe("confirmedByThisCode", () => {
  it("is true when the confirmation and the sign-in come from the same request", () => {
    expect(confirmedByThisCode({ email_confirmed_at: "2026-10-24T18:03:31.266909Z", last_sign_in_at: "2026-10-24T18:03:31.269723294Z" })).toBe(true);
  });

  it("is false for an account confirmed earlier", () => {
    expect(confirmedByThisCode({ email_confirmed_at: "2026-10-24T18:03:31.266909Z", last_sign_in_at: "2026-10-24T18:03:36.270000Z" })).toBe(false);
  });

  it("is false when a timestamp is missing or unreadable", () => {
    expect(confirmedByThisCode(null)).toBe(false);
    expect(confirmedByThisCode({ email_confirmed_at: undefined, last_sign_in_at: "2026-10-24T18:03:31Z" })).toBe(false);
    expect(confirmedByThisCode({ email_confirmed_at: "not a date", last_sign_in_at: "2026-10-24T18:03:31Z" })).toBe(false);
  });

  it("is false when the sign-in is stamped before the confirmation", () => {
    expect(confirmedByThisCode({ email_confirmed_at: "2026-10-24T18:03:31Z", last_sign_in_at: "2026-10-24T18:03:30Z" })).toBe(false);
  });
});

describe("unusablePassword", () => {
  it("fits the 72-byte limit and has each kind of character", () => {
    const password = unusablePassword();
    expect(new TextEncoder().encode(password).length).toBeLessThanOrEqual(72);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/\d/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });
});
