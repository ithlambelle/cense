// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SPENDING_COPY } from "@/lib/quiz/spending";

import { CHOICE_FEEDBACK_MS, QuizFlow } from "./quiz-flow";
import { ADVANCE_HINT } from "./quiz-screen";

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => router }));
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  track,
}));

type Reply = { status: number; body: unknown };

// Answers each request in turn. A reply can be held back to test what the
// screen allows while a save is still in flight.
function server(replies: (Reply | Promise<Reply>)[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = await replies.shift();
    if (!reply) throw new Error("unexpected request");
    return Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const NO_DRAFT: Reply = { status: 404, body: { error: { code: "not_found", message: "No saved quiz yet." } } };
const saved = (answers: unknown): Reply => ({ status: 200, body: { answers, updatedAt: "2026-10-11T00:00:00Z" } });

function sentAnswers(fetchFn: ReturnType<typeof server>, call: number) {
  return JSON.parse(String(fetchFn.mock.calls[call][1]?.body)).answers;
}

// Fake timers, so the check shown after a tap (CHOICE_FEEDBACK_MS) passes when
// a test says so instead of really waiting at every step. shouldAdvanceTime
// keeps Testing Library's own short setTimeout waits running.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  push.mockClear();
  replace.mockClear();
  track.mockClear();
});

const answer = (name: string) => screen.getByRole("button", { name });

// Taps an answer and lets its feedback delay pass.
async function tap(name: string) {
  fireEvent.click(answer(name));
  await act(() => vi.advanceTimersByTimeAsync(CHOICE_FEEDBACK_MS));
}

describe("QuizFlow", () => {
  it("starts at question 1 when nothing is saved and says that a tap moves on", async () => {
    server([NO_DRAFT]);
    render(<QuizFlow />);
    expect(await screen.findByRole("heading", { name: "How old are you?" })).toBeTruthy();
    expect(screen.getByText("Question 1 of 7")).toBeTruthy();
    expect(screen.getByText(ADVANCE_HINT)).toBeTruthy();
    expect(screen.getByRole("group", { name: "How old are you?" }).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Under 18" })).toBeNull();
  });

  it("resumes at the first unanswered question, without the hint after question 1", async () => {
    server([saved({ under21: true, incomeBand: "under_5k" })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Question 3 of 7")).toBeTruthy();
    expect(screen.queryByText(ADVANCE_HINT)).toBeNull();
  });

  it("saves the whole draft when an answer is tapped, then moves on with focus on the new question", async () => {
    const fetchFn = server([saved({ under21: true }), saved({ under21: true, incomeBand: "none" })]);
    render(<QuizFlow />);
    await screen.findByText("Question 2 of 7");
    fireEvent.click(answer("None"));
    expect(answer("None").getAttribute("aria-pressed")).toBe("true");
    await act(() => vi.advanceTimersByTimeAsync(CHOICE_FEEDBACK_MS));
    expect(await screen.findByText("Question 3 of 7")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(sentAnswers(fetchFn, 1)).toEqual({ under21: true, incomeBand: "none" });
  });

  it("shows the hi-fi subtitle with the income line that matches the saved age", async () => {
    server([saved({ under21: false })]);
    render(<QuizFlow />);
    expect(await screen.findByText("A rough guess is fine. Count income you can reasonably access.")).toBeTruthy();
  });

  it("locks the answers, Back and Close while a save is in flight, so an answer cannot be lost", async () => {
    let release: (reply: Reply) => void = () => undefined;
    const held = new Promise<Reply>((resolve) => {
      release = resolve;
    });
    const fetchFn = server([NO_DRAFT, held]);
    render(<QuizFlow />);
    await screen.findByText("Question 1 of 7");
    fireEvent.click(answer("18 to 20"));
    fireEvent.click(answer("21 or over"));

    expect(answer("18 to 20").hasAttribute("disabled")).toBe(true);
    expect(answer("21 or over").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Back" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Close quiz" }).hasAttribute("disabled")).toBe(true);

    release(saved({ under21: true }));
    await act(() => vi.advanceTimersByTimeAsync(CHOICE_FEEDBACK_MS));
    expect(await screen.findByText("Question 2 of 7")).toBeTruthy();
    // The second tap, made while saving, sent nothing.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sentAnswers(fetchFn, 1)).toEqual({ under21: true });
  });

  it("stays on the question with the choice shown and the reason given when a save fails", async () => {
    server([NO_DRAFT, { status: 500, body: "crash" }]);
    render(<QuizFlow />);
    await screen.findByText("Question 1 of 7");
    await tap("18 to 20");
    expect((await screen.findByRole("alert")).textContent).not.toContain("crash");
    expect(screen.getByText("Question 1 of 7")).toBeTruthy();
    expect(answer("18 to 20").getAttribute("aria-pressed")).toBe("true");
    expect(answer("18 to 20").hasAttribute("disabled")).toBe(false);
  });

  it("saves the last question, then asks the spending question, which can be skipped", async () => {
    const five = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false };
    const fetchFn = server([saved(five), saved({ ...five, canDeposit: true })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Question 6 of 7")).toBeTruthy();
    await tap("Yes");
    expect(await screen.findByText("Question 7 of 7")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: SPENDING_COPY.title }));
    expect(sentAnswers(fetchFn, 1)).toEqual({ ...five, canDeposit: true });
    expect(track).toHaveBeenCalledWith("quiz_completed", { retake: false });
    expect(track).not.toHaveBeenCalledWith("quiz_started");
    expect(replace).not.toHaveBeenCalled();
    // Nothing picked: Continue still moves on.
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(replace).toHaveBeenCalledWith("/results");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("picks up to two spending areas and one amount, and never saves or tracks them", async () => {
    const five = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false };
    const fetchFn = server([saved(five), saved({ ...five, canDeposit: true })]);
    render(<QuizFlow />);
    await screen.findByText("Question 6 of 7");
    await tap("Yes");
    await screen.findByText("Question 7 of 7");
    track.mockClear();
    for (const name of ["Food and dining", "Groceries", "Travel home", "Under $200", "$200 to $500"]) {
      fireEvent.click(answer(name));
    }
    const pressed = (name: string) => answer(name).getAttribute("aria-pressed");
    // The third area replaced the oldest; the second amount replaced the first.
    expect(["Food and dining", "Groceries", "Travel home"].map(pressed)).toEqual(["false", "true", "true"]);
    expect(["Under $200", "$200 to $500"].map(pressed)).toEqual(["false", "true"]);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(replace).toHaveBeenCalledWith("/results");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(track).not.toHaveBeenCalled();
  });

  it("goes back from the spending question to question 6 and counts the quiz completed once", async () => {
    const five = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false };
    server([saved(five), saved({ ...five, canDeposit: true }), saved({ ...five, canDeposit: false })]);
    render(<QuizFlow />);
    await screen.findByText("Question 6 of 7");
    await tap("Yes");
    await screen.findByText("Question 7 of 7");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Question 6 of 7")).toBeTruthy();
    expect(answer("Yes").getAttribute("aria-pressed")).toBe("true");
    await tap("No");
    expect(await screen.findByText("Question 7 of 7")).toBeTruthy();
    expect(track.mock.calls.filter(([name]) => name === "quiz_completed")).toHaveLength(1);
  });

  it("counts a quiz as started on the first saved answer of a fresh quiz, with no answer in the event", async () => {
    server([NO_DRAFT, saved({ under21: true })]);
    render(<QuizFlow />);
    await screen.findByText("Question 1 of 7");
    await tap("18 to 20");
    expect(await screen.findByText("Question 2 of 7")).toBeTruthy();
    expect(track.mock.calls).toEqual([
      ["quiz_started"],
      ["quiz_step_completed", { step: 1, field: "under21", retake: false }],
    ]);
  });

  it("does not open results when the student left while the last answer was saving", async () => {
    const five = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false };
    let release: (reply: Reply) => void = () => undefined;
    const held = new Promise<Reply>((resolve) => {
      release = resolve;
    });
    const fetchFn = server([saved(five), held]);
    const { unmount } = render(<QuizFlow />);
    expect(await screen.findByText("Question 6 of 7")).toBeTruthy();
    fireEvent.click(answer("Yes"));
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    // The bottom bar took the student elsewhere before the save answered.
    unmount();
    release(saved({ ...five, canDeposit: true }));
    await vi.advanceTimersByTimeAsync(CHOICE_FEEDBACK_MS);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("goes back a question keeping the answer, and closes to Home", async () => {
    server([saved({ under21: true })]);
    render(<QuizFlow />);
    await screen.findByText("Question 2 of 7");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Question 1 of 7")).toBeTruthy();
    expect(answer("18 to 20").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close quiz" }));
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("on a retake, holds the edits and saves them once at the last question", async () => {
    const all = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
    const fetchFn = server([saved(all), saved({ ...all, under21: false, canDeposit: false })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Question 1 of 7")).toBeTruthy();
    await tap("21 or over");
    expect(await screen.findByText("Question 2 of 7")).toBeTruthy();
    // The same answers as saved, through question 5.
    for (const [choice, next] of [["Under $5k", 3], ["Yes", 4], ["None", 5], ["No", 6]] as const) {
      await tap(choice);
      expect(await screen.findByText(`Question ${next} of 7`)).toBeTruthy();
    }
    // Only the first read so far: no answer was saved on the way.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await tap("No");
    expect(await screen.findByText("Question 7 of 7")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(sentAnswers(fetchFn, 1)).toEqual({ ...all, under21: false, canDeposit: false });
    expect(track).toHaveBeenCalledWith("quiz_completed", { retake: true });
  });

  it("on a retake, closing midway saves nothing, so the saved answers stay whole", async () => {
    const all = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
    const fetchFn = server([saved(all)]);
    render(<QuizFlow />);
    await screen.findByText("Question 1 of 7");
    await tap("21 or over");
    expect(await screen.findByText("Question 2 of 7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close quiz" }));
    expect(push).toHaveBeenCalledWith("/home");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("keeps the bottom bar while the quiz loads and when loading fails, then retries", async () => {
    let release: (reply: Reply) => void = () => undefined;
    const held = new Promise<Reply>((resolve) => {
      release = resolve;
    });
    server([held, NO_DRAFT]);
    render(<QuizFlow />);
    expect(screen.getByRole("status").textContent).toBe("Loading your quiz");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    release({ status: 500, body: "crash" });
    expect(await screen.findByRole("heading", { name: "We couldn’t load your quiz" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Question 1 of 7")).toBeTruthy();
  });

  it("sends a signed-out student to sign in, with a way back to the quiz", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<QuizFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fquiz"));
  });
});
