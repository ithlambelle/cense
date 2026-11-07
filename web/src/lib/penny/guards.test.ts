import { describe, expect, it } from "vitest";

import { findAnswer, type PennyAnswer } from "./answers";
import { groundedReply, scrubPersonalDetails } from "./guards";

describe("scrubPersonalDetails", () => {
  it.each([
    ["I'm jordan.lee@bu.edu, is that bad?", "I'm [removed], is that bad?"],
    ["call me at 617-555-0142", "call me at [removed]"],
    ["my number is (617) 555 0142", "my number is [removed]"],
    ["+1 617 555 0142 ok", "[removed] ok"],
    ["card 4111 1111 1111 1111 declined", "card [removed] declined"],
    ["account 12345678", "account [removed]"],
    ["ssn 123-45-6789", "ssn [removed]"],
  ])("removes personal details from %j", (input, expected) => {
    expect(scrubPersonalDetails(input)).toBe(expected);
  });

  it.each([
    "Is a $1,500 limit enough?",
    "I'm 19 and make $12,000 a year",
    "Is 30% utilization ok in 2026?",
    "What happens after 90 days?",
  ])("keeps amounts, ages and dates in %j", (input) => {
    expect(scrubPersonalDetails(input)).toBe(input);
  });
});

describe("groundedReply", () => {
  const score = findAnswer("credit-score") as PennyAnswer;

  it("keeps a rephrasing that only uses the answer's facts, with curly apostrophes", () => {
    expect(groundedReply("It's a number from 300 to 850 that lenders use.", score)).toBe("It’s a number from 300 to 850 that lenders use.");
  });

  it.each([
    ["a number the answer does not have", "Most scores sit near 700."],
    ["a percentage the answer does not have", "It goes up 90% of the time."],
    ["a link", "See https://example.com for more."],
    ["an email", "Write to help@example.com."],
    ["a card name", "The Discover it Student Cash Back helps your score."],
    ["an issuer name", "Capital One reports to the bureaus."],
    ["nothing", "   "],
    ["no reply", null],
  ])("falls back to the checked answer for %s", (_case, reply) => {
    expect(groundedReply(reply, score)).toBe(score.answer);
  });

  it("falls back when the reply is too long for a bubble", () => {
    expect(groundedReply("A credit score sums up your history. ".repeat(20), score)).toBe(score.answer);
  });

  it("accepts the same number written without its comma", () => {
    const fdic = findAnswer("fdic-insurance") as PennyAnswer;
    expect(groundedReply("Coverage is 250000 dollars per depositor.", fdic)).toBe("Coverage is 250000 dollars per depositor.");
  });
});

// PEN-05 option (b), Ben's D8 of Oct 27: the student reads the model's
// wording, so anything it adds falls back to the checked answer.
describe("groundedReply, rephrased (PEN-05 b)", () => {
  const score = findAnswer("credit-score") as PennyAnswer;
  const preapproval = findAnswer("preapproval-vs-applying") as PennyAnswer;
  const fdic = findAnswer("fdic-insurance") as PennyAnswer;

  it.each([
    ["a spelled-out number", score, "Most scores range from three hundred to eight fifty."],
    ["should", preapproval, "Preapproved offers are a soft inquiry, so you should check them."],
    ["approved", preapproval, "Preapproved offers are a soft inquiry, and lenders say you are approved."],
    ["guarantee", preapproval, "Soft inquiries guarantee your credit scores stay the same."],
    ["an investment word", score, "Lenders, landlords and insurers use your credit score, and so do crypto apps."],
    ["a sentence its answer cannot back", preapproval, "Soft inquiries raise your score, so check often."],
  ])("falls back for %s", (_case, answer, reply) => {
    expect(groundedReply(reply, answer)).toBe(answer.answer);
  });

  it("keeps an investment word the answer itself has", () => {
    expect(groundedReply("Stocks, bonds and crypto are not covered, even at an insured bank.", fdic)).toBe(
      "Stocks, bonds and crypto are not covered, even at an insured bank.",
    );
  });

  it("keeps a rephrasing whose every sentence the answer backs", () => {
    const reply = "Checking preapproved offers is a soft inquiry, so your credit scores stay put. Applying is what triggers a hard inquiry.";
    expect(groundedReply(reply, preapproval)).toBe(reply);
  });
});
