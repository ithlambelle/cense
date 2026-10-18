import { describe, expect, it } from "vitest";

import { applicationParam } from "./denied";

const ID = "00000000-0000-4000-8000-000000000001";

describe("applicationParam", () => {
  it("keeps a valid application id", () => {
    expect(applicationParam(ID)).toBe(ID);
  });

  it("takes the first value when the address repeats it", () => {
    expect(applicationParam([ID, "00000000-0000-4000-8000-000000000002"])).toBe(ID);
  });

  it.each([undefined, "", [], "not-an-id", `${ID}x`, ["not-an-id", ID]])("drops %j", (value) => {
    expect(applicationParam(value)).toBeNull();
  });
});
