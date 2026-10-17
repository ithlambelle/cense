import { describe, expect, it } from "vitest";

import { STATUS_LABELS } from "./applications";

describe("application status wording", () => {
  it("has plain words for every status", () => {
    expect(STATUS_LABELS).toEqual({ applied: "Applied", approved: "Approved", rejected: "Not approved" });
  });
});
