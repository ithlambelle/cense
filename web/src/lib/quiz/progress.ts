import { firstUnanswered, QUESTIONS, type QuizAnswers } from "./questions";
import { QUIZ_STEP_COUNT } from "./spending";

// How many questions are answered, counted the way the quiz picks where to
// reopen: the first unanswered one (firstUnanswered).
export function answeredCount(answers: QuizAnswers): number {
  return firstUnanswered(answers) ?? QUESTIONS.length;
}

export const QUIZ_RETAKE = "Retake the quiz";

// How every screen talks about the quiz (Home's quiz card, Results before a
// match, Your account), from the same count, so no two disagree: "7 questions"
// and "Start the quiz" before starting, "5 more questions" and "Continue the
// quiz" once started (the quiz then reopens on "Question 3 of 7"). With the six
// rules questions answered the quiz is done (the spending question is
// optional), and opening it again is a retake from question 1, never a
// continue (quiz-flow.tsx).
export function quizProgress(answered: number) {
  if (answered >= QUESTIONS.length) return { done: true, questions: `${QUIZ_STEP_COUNT} questions`, action: QUIZ_RETAKE };
  if (answered === 0) return { done: false, questions: `${QUIZ_STEP_COUNT} questions`, action: "Start the quiz" };
  const left = QUIZ_STEP_COUNT - answered;
  return { done: false, questions: `${left} more ${left === 1 ? "question" : "questions"}`, action: "Continue the quiz" };
}
