import { describe, expect, it } from "vitest";

import { QUESTIONS } from "@/lib/quiz/questions";

import { EVENTS, QUIZ_FIELDS, TRACKING_PLAN_VERSION } from "./analytics-catalog";

describe("event catalog", () => {
  it("names every event in snake_case, object then past-tense verb", () => {
    for (const name of Object.keys(EVENTS)) {
      expect(name, name).toMatch(/^[a-z]+(_[a-z]+)*_(started|completed|viewed|clicked|reported|answered|added|asked|saved|sent|changed)$/);
    }
  });

  it("gives every event a question, an owner and a plan version that exists", () => {
    for (const [name, entry] of Object.entries(EVENTS)) {
      expect(entry.question.length, name).toBeGreaterThan(10);
      expect(entry.owner, name).not.toBe("");
      expect(entry.addedIn, name).toBeGreaterThanOrEqual(1);
      expect(entry.addedIn, name).toBeLessThanOrEqual(TRACKING_PLAN_VERSION);
    }
  });

  it("names snake_case properties and rejects unknown ones", () => {
    for (const [name, entry] of Object.entries(EVENTS)) {
      for (const prop of Object.keys(entry.properties.shape)) expect(prop, name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(entry.properties.safeParse({ unexpected: 1 }).success, name).toBe(false);
    }
  });

  it("lists the quiz's answer fields in the quiz's order", () => {
    expect([...QUIZ_FIELDS]).toEqual(QUESTIONS.map((question) => question.field));
  });

  it("has no Ask Penny outcome that says a student reached the 988 line", () => {
    // Health-related, and tied to the student's id (audit PEN-06).
    expect(EVENTS.penny_question_asked.properties.safeParse({ source: "typed", outcome: "crisis" }).success).toBe(false);
  });

  it("has no property that could carry personal data", () => {
    const banned = /email|name|income|denial_reason|limit|password|code|token|phone|address/;
    for (const [name, entry] of Object.entries(EVENTS)) {
      for (const prop of Object.keys(entry.properties.shape)) expect(prop, `${name}.${prop}`).not.toMatch(banned);
    }
  });
});
