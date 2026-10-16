// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuizFlow } from "./quiz-flow";

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

describe("QuizFlow", () => {
  it("starts at question 1 when nothing is saved, with Continue off until a choice is made", async () => {
    server([NO_DRAFT]);
    render(<QuizFlow />);
    expect(await screen.findByRole("heading", { name: "How old are you?" })).toBeTruthy();
    expect(screen.getByText("Question 1 of 6")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
  });

  it("resumes at the first unanswered question", async () => {
    server([saved({ under21: true, incomeBand: "under_5k" })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Question 3 of 6")).toBeTruthy();
  });

  it("saves the whole draft on Continue, with no empty or unknown keys, then moves on", async () => {
    const fetchFn = server([saved({ under21: true }), saved({ under21: true, incomeBand: "none" })]);
    render(<QuizFlow />);
    fireEvent.click(await screen.findByLabelText("None"));
    const proceed = screen.getByRole("button", { name: "Continue" });
    // Put focus where a real press leaves it, so the check below means something.
    proceed.focus();
    expect(document.activeElement).toBe(proceed);
    fireEvent.click(proceed);
    expect(await screen.findByText("Question 3 of 6")).toBeTruthy();
    // Focus moves to the new question, so a keyboard or screen reader user follows.
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(sentAnswers(fetchFn, 1)).toEqual({ under21: true, incomeBand: "none" });
  });

  it("shows the income help text that matches the saved age", async () => {
    server([saved({ under21: false })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Your income, plus household income you can reasonably use.")).toBeTruthy();
  });

  it("locks the choices and Back while a save is in flight, so an answer cannot be lost", async () => {
    let release: (reply: Reply) => void = () => undefined;
    const held = new Promise<Reply>((resolve) => {
      release = resolve;
    });
    server([NO_DRAFT, held]);
    render(<QuizFlow />);
    fireEvent.click(await screen.findByLabelText("18 to 20"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.every((radio) => radio.disabled)).toBe(true);
    expect(screen.getByRole("button", { name: "Back" }).hasAttribute("disabled")).toBe(true);

    release(saved({ under21: true }));
    expect(await screen.findByText("Question 2 of 6")).toBeTruthy();
  });

  it("stays on the question and shows the reason when a save fails", async () => {
    server([NO_DRAFT, { status: 500, body: "crash" }]);
    render(<QuizFlow />);
    fireEvent.click(await screen.findByLabelText("18 to 20"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).not.toContain("crash");
    expect(screen.getByText("Question 1 of 6")).toBeTruthy();
    expect((screen.getByLabelText("18 to 20") as HTMLInputElement).checked).toBe(true);
  });

  it("goes to results after the last question", async () => {
    const five = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false };
    const fetchFn = server([saved(five), saved({ ...five, canDeposit: true })]);
    render(<QuizFlow />);
    expect(await screen.findByText("Question 6 of 6")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Yes"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/results"));
    expect(sentAnswers(fetchFn, 1)).toEqual({ ...five, canDeposit: true });
  });

  it("sends a signed-out student to sign in, with a way back to the quiz", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<QuizFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fquiz"));
  });
});
