import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { unsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

const SECRET = "test-unsubscribe-secret"; // gitleaks:allow
const STUDENT = "00000000-0000-4000-8000-0000000000aa";

describe("unsubscribe token", () => {
  it("round-trips the student id and never holds an email", () => {
    const token = unsubscribeToken(STUDENT, SECRET);
    expect(token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain("@");
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(STUDENT);
  });

  it("rejects a changed id, a changed signature, another secret and junk", () => {
    const token = unsubscribeToken(STUDENT, SECRET);
    const [, signature] = token.split(".");
    const other = "00000000-0000-4000-8000-0000000000bb";
    expect(verifyUnsubscribeToken(`${other}.${signature}`, SECRET)).toBeNull();
    const flipped = signature.slice(0, 10) + (signature[10] === "A" ? "B" : "A") + signature.slice(11);
    expect(verifyUnsubscribeToken(`${STUDENT}.${flipped}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(token, "another-secret")).toBeNull();
    for (const junk of [null, "", STUDENT, `${STUDENT}.`, `${token}x`, token.toUpperCase()]) {
      expect(verifyUnsubscribeToken(junk, SECRET)).toBeNull();
    }
  });
});
