import { afterEach, describe, expect, it, vi } from "vitest";

import { loadApplicationDetail, loadStudentSnapshot } from "./student-data";

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
