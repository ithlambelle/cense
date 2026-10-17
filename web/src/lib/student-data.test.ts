import { afterEach, describe, expect, it, vi } from "vitest";

import { loadStudentSnapshot } from "./student-data";

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
    expect(snapshot.quizStarted).toBe(true);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("counts a draft with one bad answer as started, so Home offers to continue", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const snapshot = await loadStudentSnapshot(studentWithDraft({ under21: true, incomeBand: "lots" }));
    expect(snapshot.quiz.kind).toBe("quiz_unfinished");
    expect(snapshot.quizStarted).toBe(true);
  });

  it("is not started when nothing is saved", async () => {
    const snapshot = await loadStudentSnapshot(studentWithDraft(undefined));
    expect(snapshot).toEqual({ applications: [], quiz: { kind: "quiz_unfinished" }, quizStarted: false });
  });
});
