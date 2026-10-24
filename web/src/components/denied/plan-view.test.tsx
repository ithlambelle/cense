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

function server(replies: { status: number; body: unknown }[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return reply.status === 204 ? new Response(null, { status: 204 }) : Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const markDone = () => fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  replace.mockClear();
});

describe("DeniedPlanView", () => {
  it("loads saved stars, opens the step up next, and lights or puts out a star", async () => {
    const fetchFn = server([
      { status: 200, body: plan("read_letter", "check_reports") },
      { status: 201, body: saved("pause_applications") },
      { status: 204, body: null },
    ]);
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("2 of 5 done")).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe(PLAN_URL);
    expect(screen.getByText("UP NEXT").nextSibling?.textContent).toBe("Pause new applications");

    markDone();
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe(`${PLAN_URL}/steps/pause_applications`);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(screen.getByText("3 of 5 done")).toBeTruthy();
    expect(screen.getByText("UP NEXT").nextSibling?.textContent).toBe("Build credit another way");

    fireEvent.click(screen.getByRole("button", { name: /Read the issuer’s letter/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mark as not done" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    expect(fetchFn.mock.calls[2][0]).toBe(`${PLAN_URL}/steps/read_letter`);
    expect(fetchFn.mock.calls[2][1]?.method).toBe("DELETE");
    await waitFor(() => expect(screen.getByText("2 of 5 done")).toBeTruthy());
  });

  it("puts a star back out when its save fails, and says why", async () => {
    server([
      { status: 200, body: plan() },
      { status: 500, body: { error: { code: "internal_error", message: "Something broke." } } },
    ]);
    render(<DeniedPlanView applicationId={ID} />);
    await screen.findByText("0 of 5 done");
    markDone();
    expect((await screen.findByRole("alert")).textContent).toContain("Something broke.");
    expect(screen.getByText("0 of 5 done")).toBeTruthy();
    expect(screen.getByText("UP NEXT").nextSibling?.textContent).toBe("Read the issuer’s letter");
  });

  it("undoes only the step whose save failed, keeping another that saved meanwhile", async () => {
    let failLetter: (r: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      if (!init?.method || init.method === "GET") return Response.json(plan(), { status: 200 });
      if (String(url).endsWith("read_letter")) return new Promise<Response>((resolve) => { failLetter = resolve; });
      return Response.json(saved("check_reports"), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<DeniedPlanView applicationId={ID} />);
    await screen.findByText("0 of 5 done");
    markDone();
    markDone();
    await waitFor(() => expect(screen.getByText("2 of 5 done")).toBeTruthy());
    failLetter(Response.json({}, { status: 500 }));
    await screen.findByRole("alert");
    expect(screen.getByText("1 of 5 done")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Check all three credit reports, done/ })).toBeTruthy();
  });

  it("says stars are not kept while the database has no plan steps yet", async () => {
    const fetchFn = server([{ status: 503, body: { error: { code: "service_unavailable", message: "Not available." } } }]);
    render(<DeniedPlanView applicationId={ID} />);
    expect((await screen.findByRole("status")).textContent).toContain("isn’t available yet");
    markDone();
    expect(screen.getByText("1 of 5 done")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("offers to try again when the saved plan cannot load", async () => {
    server([
      { status: 500, body: { error: { code: "internal_error", message: "Something broke." } } },
      { status: 200, body: plan("read_letter") },
    ]);
    render(<DeniedPlanView applicationId={ID} />);
    expect(await screen.findByText("We couldn’t load your saved plan. Your stars won’t be kept.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 of 5 done")).toBeTruthy();
  });

  it("sends a student whose session ended to sign in", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<DeniedPlanView applicationId={ID} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
  });

  it("shows the plan read-only, without saving, when there is no application", () => {
    const fetchFn = server([]);
    render(<DeniedPlanView applicationId={null} />);
    expect(screen.getByRole("status").textContent).toContain("stars can’t be saved here");
    expect(screen.queryByRole("button", { name: "Mark as done" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Reapply in about 6 months/ }));
    expect(screen.getByText(/Give positive history time to appear/)).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
