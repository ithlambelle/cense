import { describe, expect, it } from "vitest";

import { safeReturnPath } from "./redirect";

describe("safeReturnPath", () => {
  it("keeps a local path and query", () => {
    expect(safeReturnPath("/quiz?step=2")).toBe("/quiz?step=2");
  });

  it.each([null, "https://example.com", "//example.com", "/\\example.com"])(
    "rejects a nonlocal redirect: %s",
    (value) => expect(safeReturnPath(value)).toBe("/"),
  );
});
