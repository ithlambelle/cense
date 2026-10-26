import { describe, expect, it } from "vitest";

import { answeredCount, quizProgress } from "./progress";
import { QUESTIONS } from "./questions";
import { QUIZ_STEP_COUNT } from "./spending";

describe("quizProgress", () => {
  it("counts all of the quiz before it is started", () => {
    expect(quizProgress(0)).toEqual({ started: false, left: QUIZ_STEP_COUNT, questions: `${QUIZ_STEP_COUNT} questions`, action: "Start the quiz" });
  });

  it("counts what is left once started, as the quiz reopens after the answers", () => {
    expect(quizProgress(2)).toEqual({ started: true, left: QUIZ_STEP_COUNT - 2, questions: `${QUIZ_STEP_COUNT - 2} more questions`, action: "Continue the quiz" });
    expect(quizProgress(QUIZ_STEP_COUNT - 1).questions).toBe("1 more question");
  });
});

describe("answeredCount", () => {
  it("is where the quiz reopens: the first unanswered question", () => {
    expect(answeredCount({})).toBe(0);
    expect(answeredCount({ under21: true, incomeBand: "under_5k" })).toBe(2);
    // A gap counts as the place to reopen, as the quiz does.
    expect(answeredCount({ under21: true, student: true })).toBe(1);
    expect(answeredCount({ under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true })).toBe(QUESTIONS.length);
  });
});
