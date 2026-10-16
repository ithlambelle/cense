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

  it("gives every choice in a question its own id", () => {
    for (const question of QUESTIONS) {
      const ids = question.choices.map((choice) => choice.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("maps the six credit history choices to four stored values", () => {
    const standing = QUESTIONS[3].choices.map((choice) => choice.stores.standing);
    expect(standing).toEqual(["none", "limited", "limited", "established", "damaged", "none"]);
  });

  it("says a student loan counts on the credit history question", () => {
    expect(QUESTIONS[3].choices[2].label).toContain("a student loan counts");
  });

  it("never asks for an exact age, an exact income or an ID number", () => {
    const text = JSON.stringify(QUESTIONS).toLowerCase();
    expect(text).not.toMatch(/social security|ssn|itin|date of birth|birthday/);
  });
});

describe("income help text", () => {
  const income = QUESTIONS[1];

  it("changes with the age answer", () => {
    expect(helpText(income, { under21: true })).toContain("Count only money that is yours");
    expect(helpText(income, { under21: false })).toBe("Your income, plus household income you can reasonably use.");
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
