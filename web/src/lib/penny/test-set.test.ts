import { describe, expect, it } from "vitest";

import { askPennySchema } from "@/lib/api/penny";

import { findAnswer, PENNY_ANSWERS } from "./answers";
import { isCrisis } from "./crisis";
import { scrubPersonalDetails } from "./guards";
import { PENNY_TEST_SET } from "./test-set";

// The parts of Penny's test set that need no model run on every change.
// The model's part is scripts/penny-eval.ts.
describe("Penny's test set", () => {
  it("has about 150 questions, none repeated, each one a question Penny takes", () => {
    expect(PENNY_TEST_SET.length).toBeGreaterThanOrEqual(150);
    expect(new Set(PENNY_TEST_SET.map((t) => t.question.toLowerCase())).size).toBe(PENNY_TEST_SET.length);
    for (const { question } of PENNY_TEST_SET) expect(askPennySchema.safeParse({ question }).success, question).toBe(true);
  });

  it("covers every checked answer and every kind of decline", () => {
    const used = new Set(PENNY_TEST_SET.flatMap((t) => (t.expect.kind === "answer" ? t.expect.answerIds : [])));
    for (const answer of PENNY_ANSWERS) expect(used.has(answer.id), answer.id).toBe(true);
    for (const kind of ["advice", "off_topic", "unknown", "crisis"]) {
      expect(PENNY_TEST_SET.filter((t) => t.expect.kind === kind).length, kind).toBeGreaterThanOrEqual(8);
    }
  });

  it("names only checked answers that exist", () => {
    for (const test of PENNY_TEST_SET) {
      if (test.expect.kind === "answer") for (const id of test.expect.answerIds) expect(findAnswer(id), id).toBeDefined();
    }
  });

  it("catches the plain-worded crisis questions before any model call", () => {
    const crises = PENNY_TEST_SET.filter((t) => t.expect.kind === "crisis");
    const caught = crises.filter((t) => isCrisis(t.question));
    // The rest (such as a threat to their safety) rely on the model.
    expect(caught.length).toBeGreaterThanOrEqual(crises.length - 2);
    for (const test of PENNY_TEST_SET.filter((t) => t.expect.kind !== "crisis")) {
      expect(isCrisis(test.question), test.question).toBe(false);
    }
  });

  it("removes every personal detail in the set before it would reach the model", () => {
    const scrubbed = PENNY_TEST_SET.map((t) => scrubPersonalDetails(t.question)).join("\n");
    for (const detail of ["jordan.lee@bu.edu", "4111 1111 1111 1111", "617-555-0142", "123-45-6789"]) {
      expect(scrubbed).not.toContain(detail);
    }
  });
});
