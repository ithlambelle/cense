import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { GET } from "../../route";
import { DELETE, PUT } from "./route";

const APP = "00000000-0000-4000-8000-000000000001";
const DONE = "2026-10-24T15:00:00.000Z";

type Result = { data: unknown; error: { code?: string; message: string } | null };

// A stand-in for the student's Supabase client: the application read, then
// the plan_steps call, answer in the order given. Records what was written.
function student(application: Result, ...steps: Result[]) {
  const writes: { op: string; value?: unknown }[] = [];
  const queue = [...steps];
  const chain = (result: () => Result) => {
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order"]) query[name] = () => query;
    query.maybeSingle = async () => result();
    query.then = (resolve: (value: Result) => unknown) => Promise.resolve(result()).then(resolve);
    return query;
  };
  const supabase = {
    from: (table: string) => {
      if (table === "card_applications") return chain(() => application);
      return {
        select: () => chain(() => queue.shift()!),
        insert: (value: unknown) => { writes.push({ op: "insert", value }); return chain(() => queue.shift()!); },
        delete: () => { writes.push({ op: "delete" }); return chain(() => queue.shift()!); },
      };
    },
  };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return writes;
}

const approved: Result = { data: { status: "approved", id: APP }, error: null };
const rejected: Result = { data: { status: "rejected", id: APP }, error: null };
const params = (plan: string, step: string, id = APP) => ({ params: Promise.resolve({ id, plan, step }) });
const req = new Request("http://test");

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("PUT /applications/{id}/plans/{plan}/steps/{step}", () => {
  it("saves a first-month step for an approved card", async () => {
    const writes = student(approved, { data: { step: "planned_purchase", completed_at: DONE }, error: null });
    const response = await PUT(req, params("first_month", "planned_purchase"));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ step: "planned_purchase", completedAt: DONE });
    expect(writes).toEqual([{ op: "insert", value: { student_id: "student-1", card_application_id: APP, plan: "first_month", step: "planned_purchase" } }]);
  });

  it("answers with the first time when the step is already done", async () => {
    student(approved, { data: null, error: { code: "23505", message: "duplicate" } }, { data: { step: "payment_reminder", completed_at: DONE }, error: null });
    const response = await PUT(req, params("first_month", "payment_reminder"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ step: "payment_reminder", completedAt: DONE });
  });

  it("refuses a plan that does not fit the card's status", async () => {
    student(rejected);
    expect((await PUT(req, params("first_month", "planned_purchase"))).status).toBe(409);
    student(approved);
    expect((await PUT(req, params("denial", "read_letter"))).status).toBe(409);
  });

  it("does not know autopay, typos or a step from the other plan", async () => {
    student(approved);
    for (const [plan, step] of [["first_month", "autopay"], ["first_month", "read_letter"], ["denial", "planned_purchase"], ["weekly", "x"]]) {
      expect((await PUT(req, params(plan, step))).status).toBe(404);
    }
  });

  it("answers 404 for an application that is not the student's", async () => {
    student({ data: null, error: null });
    expect((await PUT(req, params("denial", "check_reports"))).status).toBe(404);
  });

  it("checks the session and the id", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await PUT(req, params("denial", "check_reports"))).status).toBe(401);
    student(rejected);
    expect((await PUT(req, params("denial", "check_reports", "not-a-uuid"))).status).toBe(400);
  });

  it("says the data is unavailable on a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student(rejected, { data: null, error: { code: "PGRST000", message: "down" } });
    expect((await PUT(req, params("denial", "check_reports"))).status).toBe(503);
  });
});

describe("DELETE /applications/{id}/plans/{plan}/steps/{step}", () => {
  it("undoes a step", async () => {
    const writes = student(rejected, { data: null, error: null });
    expect((await DELETE(req, params("denial", "build_credit"))).status).toBe(204);
    expect(writes).toEqual([{ op: "delete" }]);
  });

  it("refuses an unknown step without touching the database", async () => {
    const writes = student(rejected);
    expect((await DELETE(req, params("denial", "nope"))).status).toBe(404);
    expect(writes).toEqual([]);
  });
});

describe("GET /applications/{id}/plans/{plan}", () => {
  it("lists the finished steps", async () => {
    student(approved, { data: [{ step: "planned_purchase", completed_at: DONE }], error: null });
    const response = await GET(req, { params: Promise.resolve({ id: APP, plan: "first_month" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      applicationId: APP,
      plan: "first_month",
      completedSteps: [{ step: "planned_purchase", completedAt: DONE }],
    });
  });

  it("answers 404 for an unknown plan or someone else's application", async () => {
    student(approved);
    expect((await GET(req, { params: Promise.resolve({ id: APP, plan: "weekly" }) })).status).toBe(404);
    student({ data: null, error: null });
    expect((await GET(req, { params: Promise.resolve({ id: APP, plan: "denial" }) })).status).toBe(404);
  });
});
