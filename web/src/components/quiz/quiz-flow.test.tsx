// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuizFlow } from "./quiz-flow";
import { ADVANCE_HINT } from "./quiz-screen";

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  replace.mockClear();
});

const answer = (name: string) => screen.getByRole("button", { name });

describe("QuizFlow", () => {
  it("starts at question 1 when nothing is saved and says that a tap moves on", async () => {
    server([NO_DRAFT]);
    render(<QuizFlow />);
    expect(await screen.findByRole("heading", { name: "How old are you?" })).toBeTruthy();
    expect(screen.getByText("Question 1 of 6")).toBeTruthy();
    expect(screen.getByText(ADVANCE_HINT)).toBeTruthy();
    expect(screen.getByRole("group", { name: "How old are you?" }).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Under 18" })).toBeNull();
  });

  it("resumes at the first unanswered question, without the hint after question 1", async () => {
    server([saved({ under21: true, incomeBand: "under_5k" })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Question 3 of 6")).toBeTruthy();
    expect(screen.queryByText(ADVANCE_HINT)).toBeNull();
  });

  it("saves the whole draft when an answer is tapped, then moves on with focus on the new question", async () => {
    const fetchFn = server([saved({ under21: true }), saved({ under21: true, incomeBand: "none" })]);
    render(<QuizFlow />);
    await screen.findByText("Question 2 of 6");
    fireEvent.click(answer("None"));
    expect(answer("None").getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("Question 3 of 6")).toBeTruthy();
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
    await screen.findByText("Question 1 of 6");
    fireEvent.click(answer("18 to 20"));
    fireEvent.click(answer("21 or over"));

    expect(answer("18 to 20").hasAttribute("disabled")).toBe(true);
    expect(answer("21 or over").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Back" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Close quiz" }).hasAttribute("disabled")).toBe(true);

    release(saved({ under21: true }));
    expect(await screen.findByText("Question 2 of 6")).toBeTruthy();
    // The second tap, made while saving, sent nothing.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sentAnswers(fetchFn, 1)).toEqual({ under21: true });
  });

  it("stays on the question with the choice shown and the reason given when a save fails", async () => {
    server([NO_DRAFT, { status: 500, body: "crash" }]);
    render(<QuizFlow />);
    await screen.findByText("Question 1 of 6");
    fireEvent.click(answer("18 to 20"));
    expect((await screen.findByRole("alert")).textContent).not.toContain("crash");
    expect(screen.getByText("Question 1 of 6")).toBeTruthy();
    expect(answer("18 to 20").getAttribute("aria-pressed")).toBe("true");
    expect(answer("18 to 20").hasAttribute("disabled")).toBe(false);
  });

  it("goes to results after the last question", async () => {
    const five = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false };
    const fetchFn = server([saved(five), saved({ ...five, canDeposit: true })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Question 6 of 6")).toBeTruthy();
    fireEvent.click(answer("Yes"));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/results"));
    expect(sentAnswers(fetchFn, 1)).toEqual({ ...five, canDeposit: true });
  });

  it("goes back a question keeping the answer, and closes to Home", async () => {
    server([saved({ under21: true })]);
    render(<QuizFlow />);
    await screen.findByText("Question 2 of 6");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Question 1 of 6")).toBeTruthy();
    expect(answer("18 to 20").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close quiz" }));
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("on a retake, holds the edits and saves them once at the last question", async () => {
    const all = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
    const fetchFn = server([saved(all), saved({ ...all, under21: false, canDeposit: false })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Question 1 of 6")).toBeTruthy();
    fireEvent.click(answer("21 or over"));
    expect(await screen.findByText("Question 2 of 6")).toBeTruthy();
    // The same answers as saved, through question 5.
    for (const [choice, next] of [["Under $5k", 3], ["Yes", 4], ["None", 5], ["No", 6]] as const) {
      fireEvent.click(answer(choice));
      expect(await screen.findByText(`Question ${next} of 6`)).toBeTruthy();
    }
    // Only the first read so far: no answer was saved on the way.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    fireEvent.click(answer("No"));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/results"));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(sentAnswers(fetchFn, 1)).toEqual({ ...all, under21: false, canDeposit: false });
  });

  it("on a retake, closing midway saves nothing, so the saved answers stay whole", async () => {
    const all = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
    const fetchFn = server([saved(all)]);
    render(<QuizFlow />);
    await screen.findByText("Question 1 of 6");
    fireEvent.click(answer("21 or over"));
    expect(await screen.findByText("Question 2 of 6")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close quiz" }));
    expect(push).toHaveBeenCalledWith("/home");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("sends a signed-out student to sign in, with a way back to the quiz", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<QuizFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fquiz"));
  });
});
