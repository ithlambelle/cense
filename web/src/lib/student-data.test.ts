import { afterEach, describe, expect, it, vi } from "vitest";

import { findCard, listCards } from "./cards/catalog";
import { computeResult } from "./results/compute";
import { loadApplicationDetail, loadCardQuiz, loadStudentSnapshot } from "./student-data";

// "server-only" refuses to load outside a server build; this test is the server.
vi.mock("server-only", () => ({}));

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };

// A stand-in for the student's Supabase client: just the two reads the snapshot makes.
function studentWithDraft(answers: unknown) {
  const applications = { order: async () => ({ data: [], error: null }) };
  const draft = { maybeSingle: async () => ({ data: answers === undefined ? null : { answers }, error: null }) };
  const supabase = {
    from: (table: string) => ({
      select: () => ({ eq: () => (table === "card_applications" ? applications : draft) }),
    }),
  };
  return { supabase, studentId: "00000000-0000-4000-8000-0000000000ff", email: null } as unknown as Parameters<
    typeof loadStudentSnapshot
  >[0];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadStudentSnapshot", () => {
  it("keeps the valid answers of a draft the schema now rejects, as GET /quiz does", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // A retired field next to six good answers used to throw the whole draft away.
    const snapshot = await loadStudentSnapshot(studentWithDraft({ ...ALL_SIX, retiredField: "x" }));
    expect(snapshot.quiz.kind).toBe("match");
    expect(snapshot.quizAnswered).toBe(6);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("counts a draft with one bad answer as started, so Home offers to continue", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const snapshot = await loadStudentSnapshot(studentWithDraft({ under21: true, incomeBand: "lots" }));
    expect(snapshot.quiz.kind).toBe("quiz_unfinished");
    expect(snapshot.quizAnswered).toBe(1);
  });

  it("counts one saved answer as started", async () => {
    const snapshot = await loadStudentSnapshot(studentWithDraft({ under21: true }));
    expect(snapshot.quiz.kind).toBe("quiz_unfinished");
    expect(snapshot.quizAnswered).toBe(1);
  });

  // The quiz reopens on the first unanswered question, so Home counts from there.
  it("counts the answers the quiz will reopen after", async () => {
    expect((await loadStudentSnapshot(studentWithDraft({ under21: true, incomeBand: "under_5k" }))).quizAnswered).toBe(2);
  });

  it("is not started when the saved draft has no answers", async () => {
    const snapshot = await loadStudentSnapshot(studentWithDraft({}));
    expect(snapshot.quizAnswered).toBe(0);
  });

  it("is not started when nothing is saved", async () => {
    const snapshot = await loadStudentSnapshot(studentWithDraft(undefined));
    expect(snapshot).toEqual({ applications: [], quiz: { kind: "quiz_unfinished" }, quizAnswered: 0 });
  });
});

describe("loadCardQuiz", () => {
  const discover = () => findCard("discover-it-student-cash-back")!;

  it("gives a card the same tier and reasons Your match gives it, and the spending answer", async () => {
    const answers = { ...ALL_SIX, spendingBand: "200_to_500", spendingCategories: ["groceries"] };
    const { fit, profile } = await loadCardQuiz(studentWithDraft(answers), discover());
    const result = computeResult(answers, listCards());
    if (result.kind !== "match") throw new Error("expected a match");
    const onResult = result.options.find((option) => option.card.id === "discover-it-student-cash-back");
    expect(onResult).toBeDefined();
    expect(fit).toEqual(onResult!.fit);
    expect(profile).toEqual({ categories: ["groceries"], band: "200_to_500" });
  });

  it("has no fit before the quiz is finished", async () => {
    const { fit, profile } = await loadCardQuiz(studentWithDraft({ under21: true }), discover());
    expect(fit).toBeNull();
    expect(profile).toBeNull();
  });

  it("has no fit for a card the rules do not tier (an explore card)", async () => {
    const explore = listCards().find((card) => card.catalogRole === "explore")!;
    expect((await loadCardQuiz(studentWithDraft(ALL_SIX), explore)).fit).toBeNull();
  });
});

describe("loadApplicationDetail", () => {
  const ROW = {
    id: "00000000-0000-4000-8000-000000000001",
    card_id: null,
    card_name: "Student Cash Card",
    status: "rejected",
    credit_limit_cents: null,
    applied_at: null,
    updated_at: "2026-10-22T00:00:00Z",
    denial_reason: "no_letter_yet",
    denial_reason_note: null,
    autopay_status: "unknown",
    autopay_payment_type: null,
    spend_limit_cents: null,
    statement_closing_day: null,
    payment_due_day: null,
  };

  function studentWithRow(row: unknown) {
    const select = vi.fn(() => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }));
    const supabase = { from: () => ({ select }) };
    const student = { supabase, studentId: "00000000-0000-4000-8000-0000000000ff", email: null } as unknown as Parameters<
      typeof loadApplicationDetail
    >[0];
    return { student, select };
  }

  it("reads the card with the fields GET /applications/{id} reads", async () => {
    const { student, select } = studentWithRow(ROW);
    const detail = await loadApplicationDetail(student, ROW.id);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("denial_reason_note, autopay_status"));
    expect(detail).toMatchObject({ id: ROW.id, status: "rejected", denialReason: "no_letter_yet", autopayStatus: "unknown" });
  });

  it("is null for a card that is not the student's", async () => {
    const { student } = studentWithRow(null);
    expect(await loadApplicationDetail(student, ROW.id)).toBeNull();
  });
});
