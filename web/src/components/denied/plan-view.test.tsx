// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeniedPlanView } from "./plan-view";

vi.mock("@/components/analytics/track-on-mount", () => ({ TrackOnMount: () => null }));
const replace = vi.fn();
// One router for every render, as in the app (useLoaded reloads when it changes).
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/denied/plan", useRouter: () => router }));

const ID = "00000000-0000-4000-8000-000000000001";
const PLAN_URL = `/api/v1/applications/${ID}/plans/denial`;
const plan = (...steps: string[]) => ({
  applicationId: ID,
  plan: "denial",
  completedSteps: steps.map((step) => ({ step, completedAt: "2026-10-16T00:00:00Z" })),
});
const saved = (step: string) => ({ step, completedAt: "2026-10-16T00:00:00Z" });

const APPLICATION_URL = `/api/v1/applications/${ID}`;
const application = (denialReason: string | null, denialReasonNote: string | null = null) => ({
  status: 200,
  body: {
    id: ID,
    cardId: "discover-it-student-cash-back",
    cardName: "Discover it Student Cash Back",
    status: "rejected",
    creditLimitCents: null,
    appliedAt: null,
    statusUpdatedAt: "2026-10-24T12:00:00Z",
    denialReason,
    denialReasonNote,
    autopayStatus: "unknown",
    statementClosingDay: null,
    paymentDueDay: null,
  },
});

const REMINDERS_URL = "/api/v1/reminders";
const reapply = (remindOn: string, sentAt: string | null = null) => ({
  id: "00000000-0000-4000-8000-0000000000a1",
  applicationId: ID,
  kind: "reapply",
  occurrence: remindOn,
  remindOn,
  dueAt: `${remindOn}T13:00:00.000Z`,
  sentAt,
  actedAt: null,
  createdAt: "2026-10-24T15:00:00.000Z",
});

// Plan requests take the next reply and are counted in the returned mock. The
// read of the denial reason (GET /applications/{id}) and of the reminders
// (GET /reminders) are answered on their own.
function server(
  replies: { status: number; body: unknown }[],
  reason: { status: number; body: unknown } = application(null),
  reminders: unknown[] = [],
) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return reply.status === 204 ? new Response(null, { status: 204 }) : Response.json(reply.body, { status: reply.status });
  });
  const reasonFetch = vi.fn<typeof fetch>(async () => Response.json(reason.body, { status: reason.status }));
  const remindersFetch = vi.fn<typeof fetch>(async () => Response.json({ reminders }, { status: 200 }));
  vi.stubGlobal("fetch", ((url, init) =>
    url === APPLICATION_URL
      ? reasonFetch(url, init)
      : url === REMINDERS_URL
        ? remindersFetch(url, init)
        : fetchFn(url, init)) as typeof fetch);
  return Object.assign(fetchFn, { reasonFetch, remindersFetch });
}

// The step's circle: the one control that marks it done or not done.
const circle = (title: string) => screen.getByRole("button", { name: `Done: ${title}` });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  replace.mockClear();
});

describe("DeniedPlanView", () => {
  it("loads saved steps, and tapping a circle marks a step done or not done, with no Up next or Mark as done", async () => {
    const fetchFn = server([
      { status: 200, body: plan("read_letter", "check_reports") },
      { status: 201, body: saved("pause_applications") },
      { status: 204, body: null },
    ]);
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("2 of 5 done")).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe(PLAN_URL);
    // No step is pushed first, and there is no text control to mark one.
    expect(screen.queryByText("UP NEXT")).toBeNull();
    expect(screen.queryByText(/Mark as/)).toBeNull();
    expect(circle("Read the issuer’s letter").getAttribute("aria-pressed")).toBe("true");
    expect(circle("Pause new applications").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(circle("Pause new applications"));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe(`${PLAN_URL}/steps/pause_applications`);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(screen.getByText("3 of 5 done")).toBeTruthy();

    fireEvent.click(circle("Read the issuer’s letter"));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    expect(fetchFn.mock.calls[2][0]).toBe(`${PLAN_URL}/steps/read_letter`);
    expect(fetchFn.mock.calls[2][1]?.method).toBe("DELETE");
    await waitFor(() => expect(screen.getByText("2 of 5 done")).toBeTruthy());
  });

  it("tapping a row opens its detail, without marking it", async () => {
    const fetchFn = server([{ status: 200, body: plan() }]);
    render(<DeniedPlanView applicationId={ID} />);
    await screen.findByText("0 of 5 done");
    const row = screen.getByRole("button", { name: /^Check your credit reports/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /AnnualCreditReport.com/ })).toBeTruthy();
    expect(screen.getByText("0 of 5 done")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("puts a step back when its save fails, and says why", async () => {
    server([
      { status: 200, body: plan() },
      { status: 500, body: { error: { code: "internal_error", message: "Something broke." } } },
    ]);
    render(<DeniedPlanView applicationId={ID} />);
    await screen.findByText("0 of 5 done");
    fireEvent.click(circle("Read the issuer’s letter"));
    expect((await screen.findByRole("alert")).textContent).toContain("Something broke.");
    expect(screen.getByText("0 of 5 done")).toBeTruthy();
    expect(circle("Read the issuer’s letter").getAttribute("aria-pressed")).toBe("false");
  });

  it("undoes only the step whose save failed, keeping another that saved meanwhile", async () => {
    let failLetter: (r: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url) === REMINDERS_URL) return Response.json({ reminders: [] });
      if (!init?.method || init.method === "GET") return Response.json(plan(), { status: 200 });
      if (String(url).endsWith("read_letter")) return new Promise<Response>((resolve) => { failLetter = resolve; });
      return Response.json(saved("check_reports"), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<DeniedPlanView applicationId={ID} />);
    await screen.findByText("0 of 5 done");
    fireEvent.click(circle("Read the issuer’s letter"));
    fireEvent.click(circle("Check your credit reports"));
    await waitFor(() => expect(screen.getByText("2 of 5 done")).toBeTruthy());
    failLetter(Response.json({}, { status: 500 }));
    await screen.findByRole("alert");
    expect(screen.getByText("1 of 5 done")).toBeTruthy();
    expect(circle("Check your credit reports").getAttribute("aria-pressed")).toBe("true");
  });

  it("step 5 offers to set the reapply reminder while none is set", async () => {
    server([{ status: 200, body: plan() }]);
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("Reminder not set")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set a reminder" }).getAttribute("href")).toBe(`/denied/reminder?application=${ID}`);
    // The old always-on invitation is gone.
    expect(screen.queryByRole("link", { name: /Set a 6-month reminder/ })).toBeNull();
  });

  it("step 5 says when the reminder is set, with Change date", async () => {
    server([{ status: 200, body: plan() }], application(null), [reapply("2027-04-05")]);
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("Reminder set for Apr 5, 2027")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change date" }).getAttribute("href")).toBe(`/denied/reminder?application=${ID}`);
    expect(screen.queryByText("Reminder not set")).toBeNull();
  });

  it("step 5 keeps its reminder line and Change date once the step is done", async () => {
    server([{ status: 200, body: plan("reapply") }], application(null), [reapply("2027-04-05")]);
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("Reminder set for Apr 5, 2027")).toBeTruthy();
    expect(screen.getByText("1 of 5 done")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change date" }).getAttribute("href")).toBe(`/denied/reminder?application=${ID}`);
  });

  it("a done step still opens its detail", async () => {
    server([{ status: 200, body: plan("check_reports") }]);
    render(<DeniedPlanView applicationId={ID} />);
    await screen.findByText("1 of 5 done");
    const row = screen.getByRole("button", { name: /^Check your credit reports, done/ });
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /AnnualCreditReport.com/ })).toBeTruthy();
  });

  it("step 5 does not count a reminder already sent as set", async () => {
    server([{ status: 200, body: plan() }], application(null), [reapply("2026-11-01", "2026-11-01T13:00:00.000Z")]);
    const view = render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("Reminder not set")).toBeTruthy();
    view.unmount();
  });

  it("offers to try again when the saved plan cannot load", async () => {
    server([
      { status: 500, body: { error: { code: "internal_error", message: "Something broke." } } },
      { status: 200, body: plan("read_letter") },
    ]);
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("We couldn’t load your saved plan. Your steps won’t be kept.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 of 5 done")).toBeTruthy();
  });

  it("sends a student whose session ended to sign in", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<DeniedPlanView applicationId={ID} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
  });

  it("shows the saved reason as a plain line", async () => {
    server([{ status: 200, body: plan() }], application("no_credit_history"));
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("Reason: no credit history yet")).toBeTruthy();
  });

  it("says other for Something else, not the letter's words", async () => {
    server([{ status: 200, body: plan() }], application("something_else", "Too many recent applications"));
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("Reason: other")).toBeTruthy();
    expect(screen.queryByText(/Too many recent applications/)).toBeNull();
  });

  it("leaves the reason out when none is saved, the letter has not come, or the read fails", async () => {
    for (const reason of [application(null), application("no_letter_yet"), { status: 503, body: { error: { code: "data_unavailable", message: "Down." } } }]) {
      const fetchFn = server([{ status: 200, body: plan() }], reason);
      const { unmount } = render(<DeniedPlanView applicationId={ID} />);
      await screen.findByText("0 of 5 done");
      await waitFor(() => expect(fetchFn.reasonFetch).toHaveBeenCalledOnce());
      expect(screen.queryByText(/^Reason:/)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      unmount();
    }
  });

  it("shows the plan read-only, without saving, when there is no application", () => {
    const fetchFn = server([]);
    render(<DeniedPlanView applicationId={null} />);
    expect(screen.getByRole("status").textContent).toContain("steps can’t be saved here");
    expect((circle("Read the issuer’s letter") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Pause new applications/ }));
    expect(screen.getByText(/Use a preapproval check first when you’re ready/)).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(fetchFn.reasonFetch).not.toHaveBeenCalled();
    expect(fetchFn.remindersFetch).not.toHaveBeenCalled();
  });
});
