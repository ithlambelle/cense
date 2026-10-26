import { describe, expect, it } from "vitest";

import { answeredCount, QUIZ_RETAKE, quizProgress } from "./progress";
import { QUESTIONS } from "./questions";
import { QUIZ_STEP_COUNT } from "./spending";

describe("quizProgress", () => {
  it("counts all of the quiz before it is started", () => {
    expect(quizProgress(0)).toEqual({ done: false, questions: `${QUIZ_STEP_COUNT} questions`, action: "Start the quiz" });
  });

  it("counts what is left once started, as the quiz reopens after the answers", () => {
    expect(quizProgress(2)).toEqual({ done: false, questions: `${QUIZ_STEP_COUNT - 2} more questions`, action: "Continue the quiz" });
  });

  // The spending question is optional: with the six rules questions answered
  // the quiz is done, and opening it again starts a retake at question 1.
  it("never continues a finished quiz", () => {
    expect(quizProgress(QUESTIONS.length)).toEqual({ done: true, questions: `${QUIZ_STEP_COUNT} questions`, action: QUIZ_RETAKE });
    expect(QUIZ_RETAKE).toBe("Retake the quiz");
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
