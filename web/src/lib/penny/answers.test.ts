import { describe, expect, it } from "vitest";

import { listCards } from "@/lib/cards/catalog";

import { findAnswer, PENNY_ANSWERS, PENNY_TOPICS, STARTER_IDS, TOPIC_QUESTIONS, topicAnswers } from "./answers";

// Where a checked answer may come from: US government and regulator sites.
const OFFICIAL_HOSTS = [
  "www.consumerfinance.gov",
  "files.consumerfinance.gov",
  "consumer.gov",
  "consumer.ftc.gov",
  "www.ftc.gov",
  "www.fdic.gov",
  "studentaid.gov",
  "www.federalreserve.gov",
  "www.investor.gov",
  "www.annualcreditreport.com",
];

const words = (text: string) => text.trim().split(/\s+/).length;

describe("Penny's checked answers", () => {
  it("have unique ids and questions", () => {
    expect(new Set(PENNY_ANSWERS.map((a) => a.id)).size).toBe(PENNY_ANSWERS.length);
    expect(new Set(PENNY_ANSWERS.map((a) => a.question)).size).toBe(PENNY_ANSWERS.length);
  });

  it.each(PENNY_ANSWERS.map((a) => [a.id, a] as const))("%s follows the copy rules", (_id, answer) => {
    const count = words(answer.answer);
    expect(count).toBeGreaterThanOrEqual(25);
    expect(count).toBeLessThanOrEqual(55);
    for (const text of [answer.question, answer.answer]) {
      // No dashes, tildes, semicolons, exclamation marks or straight apostrophes.
      expect(text).not.toMatch(/[–—~;!']/);
      expect(text).not.toMatch(/ - /);
    }
    // How things work, never what to do: no "you should".
    expect(answer.answer).not.toMatch(/\bshould\b/i);
  });

  it.each(PENNY_ANSWERS.map((a) => [a.id, a] as const))("%s cites an official https page", (_id, answer) => {
    const url = new URL(answer.source.url);
    expect(url.protocol).toBe("https:");
    expect(OFFICIAL_HOSTS).toContain(url.hostname);
    expect(answer.source.name.length).toBeGreaterThan(0);
  });

  it("never names a card, bank or issuer from the catalog", () => {
    const names = new Set(listCards().flatMap((card) => [card.brand, card.issuingBank, card.name]));
    for (const answer of PENNY_ANSWERS) {
      for (const name of names) expect(answer.answer, `${answer.id} names ${name}`).not.toContain(name);
    }
  });
});

describe("topics and starters", () => {
  it("lists five answers per topic (seven on Credit), each from that topic", () => {
    for (const topic of PENNY_TOPICS) {
      const answers = topicAnswers(topic.slug);
      expect(answers, topic.slug).toHaveLength(topic.slug === "credit" ? 7 : 5);
      for (const answer of answers) expect(answer.topic).toBe(topic.slug);
    }
  });

  it("lists the Credit questions from the frame word for word (144:3285), then the two no starter reaches (D6)", () => {
    expect(topicAnswers("credit").map((a) => a.question)).toEqual([
      "How does a credit card work?",
      "What is a credit score?",
      "Preapproval vs. applying",
      "How do I avoid paying interest?",
      "What is a secured card?",
      "What is a credit limit and utilization?",
      "What happens if I pay late?",
    ]);
  });

  it("has the two starters from the Learn frame word for word (144:3071)", () => {
    expect(STARTER_IDS.map((id) => findAnswer(id)?.question)).toEqual(["How to use a credit card?", "How to budget as a student?"]);
  });

  it("keeps the frame's preapproval answer: a soft inquiry, while applying is a hard one", () => {
    const answer = findAnswer("preapproval-vs-applying")?.answer ?? "";
    expect(answer).toContain("soft inquiry");
    expect(answer).toContain("Applying is what triggers a hard inquiry.");
  });
});

// Conditions each answer's source sets, which an earlier wording dropped
// (audit PEN-03, Oct 25 2026). Re-read the source before changing one.
describe("answers keep their sources' conditions", () => {
  const text = (id: string) => findAnswer(id)?.answer ?? "";

  it("preapproval: prescreening is usual, not a promise the score stays the same", () => {
    expect(text("preapproval-vs-applying")).toContain("Preapproved offers usually come from a lender");
    expect(text("preapproval-vs-applying")).not.toContain("stays the same");
  });

  it("avoid interest: paying in full avoids interest only when no balance is carried", () => {
    expect(text("avoid-interest")).toContain("If you carry no balance, paying in full");
  });

  it("secured card: still a credit card, with a bill each month", () => {
    expect(text("secured-card")).toContain("It is still a credit card, with one bill a month");
  });

  it("paying late: never says one late payment moves an existing balance to a higher rate", () => {
    // Reg Z 1026.55(b)(4): only a payment more than 60 days late can.
    expect(text("paying-late")).not.toMatch(/introductory|existing balance/i);
  });

  it("overdraft: opting in covers one-time debit and ATM only, from CFPB's page that says so", () => {
    expect(text("overdraft-fees")).toContain("Checks and recurring electronic payments can bring fees even if you did not opt in.");
    expect(findAnswer("overdraft-fees")?.source.url).toBe(
      "https://www.consumerfinance.gov/ask-cfpb/what-can-i-do-if-my-bank-charged-me-a-fee-for-overdrawing-my-account-en-1037/",
    );
  });

  it("BNPL: an unpaid loan sent to collections could be reported (CFPB 2117)", () => {
    expect(text("buy-now-pay-later")).toContain("an unpaid loan sent to collections could be reported");
  });
});
