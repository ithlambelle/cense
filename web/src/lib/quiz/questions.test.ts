import { describe, expect, it } from "vitest";

import { quizAnswersSchema } from "../api/schemas";
import { firstUnanswered, helpText, QUESTIONS, savedChoiceId, withChoice } from "./questions";
import type { QuizAnswers } from "./questions";

const ALL_CHOICES = QUESTIONS.flatMap((question) =>
  question.choices.map((choice) => ({ field: question.field, id: choice.id, choice })),
);

describe("quiz questions", () => {
  it("has six questions, in the order of the rules page", () => {
    expect(QUESTIONS.map((question) => question.field)).toEqual([
      "under21",
      "incomeBand",
      "student",
      "standing",
      "recentDenial",
      "canDeposit",
    ]);
  });

  it.each(ALL_CHOICES)("$field / $id stores an answer the API accepts", ({ field, choice }) => {
    expect(Object.keys(choice.stores)).toEqual([field]);
    expect(quizAnswersSchema.safeParse(choice.stores).success).toBe(true);
  });

  it("offers the two age choices from the hi-fi, with no Under 18 choice", () => {
    expect(QUESTIONS[0].choices.map((choice) => choice.label)).toEqual(["18 to 20", "21 or over"]);
  });

  it("gives every question the subtitle line drawn under its title", () => {
    for (const question of QUESTIONS) expect(question.subtitle.length).toBeGreaterThan(0);
  });

  it("gives every choice in a question its own id", () => {
    for (const question of QUESTIONS) {
      const ids = question.choices.map((choice) => choice.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("maps the six credit history choices to five stored values, keeping not sure as said", () => {
    const standing = QUESTIONS[3].choices.map((choice) => choice.stores.standing);
    expect(standing).toEqual(["none", "limited", "limited", "established", "damaged", "not_sure"]);
  });

  it("uses the hi-fi wording on the credit history question", () => {
    expect(QUESTIONS[3].choices[2].label).toBe("A loan or card open less than 6 months");
  });

  it("never asks for an exact age, an exact income or an ID number", () => {
    const text = JSON.stringify(QUESTIONS).toLowerCase();
    expect(text).not.toMatch(/social security|ssn|itin|date of birth|birthday/);
  });
});

describe("income help text", () => {
  const income = QUESTIONS[1];

  it("changes with the age answer", () => {
    expect(helpText(income, { under21: true })).toBe("Count your own independent income.");
    expect(helpText(income, { under21: false })).toBe("Count income you can reasonably access.");
  });

  it("is absent until the age is known, and on every other question", () => {
    expect(helpText(income, {})).toBeNull();
    expect(helpText(QUESTIONS[0], { under21: true })).toBeNull();
  });
});

describe("answers", () => {
  it("adds a choice without changing the answers passed in", () => {
    const before: QuizAnswers = { under21: true };
    const after = withChoice(before, QUESTIONS[2].choices[0]);
    expect(after).toEqual({ under21: true, student: true });
    expect(before).toEqual({ under21: true });
  });

  it("replaces an earlier answer to the same question", () => {
    expect(withChoice({ under21: true }, QUESTIONS[0].choices[1])).toEqual({ under21: false });
  });

  it("finds the saved choice, including a saved false", () => {
    expect(savedChoiceId(QUESTIONS[0], { under21: false })).toBe("21-or-over");
    expect(savedChoiceId(QUESTIONS[0], {})).toBeNull();
  });

  it("shows the first matching choice when two store the same value", () => {
    expect(savedChoiceId(QUESTIONS[3], { standing: "none" })).toBe("none");
    expect(savedChoiceId(QUESTIONS[3], { standing: "limited" })).toBe("authorized-user");
  });

  it("resumes at the first unanswered question", () => {
    expect(firstUnanswered({})).toBe(0);
    expect(firstUnanswered({ under21: true, incomeBand: "none" })).toBe(2);
    expect(
      firstUnanswered({
        under21: true,
        incomeBand: "none",
        student: true,
        standing: "none",
        recentDenial: false,
        canDeposit: false,
      }),
    ).toBeNull();
  });
});
