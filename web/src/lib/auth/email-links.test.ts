// Created with Claude Code (2026-11-17). Where emailed sign-in and reset links point.
import { describe, expect, it } from "vitest";

import { emailLinkOrigin } from "./email-links";

const REQUEST = "https://attacker.example/api/v1/auth/password/reset";

describe("emailLinkOrigin", () => {
  it("uses APP_BASE_URL's origin, never the request's own address", () => {
    expect(emailLinkOrigin(REQUEST, { APP_BASE_URL: "https://censefinance.com/", VERCEL_ENV: "production" })).toBe("https://censefinance.com");
    expect(emailLinkOrigin(REQUEST, { APP_BASE_URL: " https://censefinance.com/some/path " })).toBe("https://censefinance.com");
  });

  it("gives nothing on production without a usable APP_BASE_URL", () => {
    expect(emailLinkOrigin(REQUEST, { VERCEL_ENV: "production" })).toBeNull();
    expect(emailLinkOrigin(REQUEST, { APP_BASE_URL: "not an address", VERCEL_ENV: "production" })).toBeNull();
    expect(emailLinkOrigin(REQUEST, { APP_BASE_URL: "javascript:alert(1)", VERCEL_ENV: "production" })).toBeNull();
  });

  it("uses the request's address only off production: local runs and Vercel previews", () => {
    expect(emailLinkOrigin("http://localhost:3300/api/v1/auth/email", {})).toBe("http://localhost:3300");
    expect(emailLinkOrigin("https://cense-git-x.vercel.app/api/v1/auth/email", { VERCEL_ENV: "preview" })).toBe("https://cense-git-x.vercel.app");
  });
});
