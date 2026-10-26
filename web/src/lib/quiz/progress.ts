import { firstUnanswered, QUESTIONS, type QuizAnswers } from "./questions";
import { QUIZ_STEP_COUNT } from "./spending";

// How many questions are answered, counted the way the quiz picks where to
// reopen: the first unanswered one (firstUnanswered).
export function answeredCount(answers: QuizAnswers): number {
  return firstUnanswered(answers) ?? QUESTIONS.length;
}

// How every screen talks about a quiz that is not finished (Home's quiz card,
// Results before a match, Your account), from the same count, so no two
// disagree: "7 questions" and "Start the quiz" before starting, "5 more
// questions" and "Continue the quiz" once started (the quiz then reopens on
// "Question 3 of 7").
export function quizProgress(answered: number) {
  const left = QUIZ_STEP_COUNT - answered;
  const started = answered > 0;
  return {
    started,
    left,
    questions: started ? `${left} more ${left === 1 ? "question" : "questions"}` : `${QUIZ_STEP_COUNT} questions`,
    action: started ? "Continue the quiz" : "Start the quiz",
  };
}
