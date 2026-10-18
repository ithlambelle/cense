import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isInternalStudent } from "./internal-students";

const ID = "00000000-0000-4000-8000-0000000000AA";

describe("isInternalStudent", () => {
  it("matches ids on the list, ignoring spaces and case", () => {
    expect(isInternalStudent(ID, ` 00000000-0000-4000-8000-0000000000aa , 00000000-0000-4000-8000-0000000000bb`)).toBe(true);
    expect(isInternalStudent("00000000-0000-4000-8000-0000000000cc", "00000000-0000-4000-8000-0000000000aa")).toBe(false);
  });

  it("is false when no list is set", () => {
    expect(isInternalStudent(ID, undefined)).toBe(false);
    expect(isInternalStudent(ID, "")).toBe(false);
  });
});
