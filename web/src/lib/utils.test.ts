import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps a custom type-scale size next to a text color", () => {
    expect(cn("text-body-l text-white")).toBe("text-body-l text-white");
    expect(cn("text-body-s", "text-indigo-black")).toBe("text-body-s text-indigo-black");
  });

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-body-l", "text-body-s")).toBe("text-body-s");
    expect(cn("text-white", "text-navy")).toBe("text-navy");
  });
});
