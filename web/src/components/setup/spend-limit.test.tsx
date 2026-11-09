// @vitest-environment jsdom
// Created with Claude Code (2026-11-08). The spend limit screens (US-04,
// Figma Flow A 477:1005): S1, S2 and S3.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpendLimitCredit } from "./spend-limit-credit";
import { SpendLimitPick } from "./spend-limit-pick";
import { SpendLimitSuggestion } from "./spend-limit-suggestion";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => router }));

const ID = "00000000-0000-4000-8000-000000000001";
const BASE = `/applications/${ID}/setup/spend-limit`;

function server(replies: { status: number; body: unknown }[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const body = (fetchFn: ReturnType<typeof server>, call: number) => JSON.parse(String(fetchFn.mock.calls[call][1]?.body));
const STEP = { step: "spend_limit", completedAt: "2026-11-08T00:00:00Z" };

afterEach(() => {
  vi.unstubAllGlobals();
  router.push.mockClear();
  router.replace.mockClear();
});

describe("S1, What is your credit limit?", () => {
  it("prefills the card's limit and goes on to the suggestion without saving it again", async () => {
    const fetchFn = server([]);
    render(<SpendLimitCredit applicationId={ID} creditLimitCents={50000} from="home" />);
    expect((screen.getByLabelText("Credit limit") as HTMLInputElement).value).toBe("$500");
    expect(screen.getByText("From your card. Edit it if it is wrong.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" }).getAttribute("href")).toBe("/home");
    fireEvent.click(screen.getByRole("button", { name: "See my suggestion" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`${BASE}/suggestion?from=home`));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses an empty or bad amount, and saves a new one first", async () => {
    const fetchFn = server([{ status: 200, body: {} }]);
    render(<SpendLimitCredit applicationId={ID} creditLimitCents={null} from="setup" />);
    expect(screen.getByRole("link", { name: "Back to Card setup" }).getAttribute("href")).toBe(`/applications/${ID}/setup`);
    fireEvent.click(screen.getByRole("button", { name: "See my suggestion" }));
    expect(screen.getByText("Enter your credit limit in dollars, like 500.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Credit limit"), { target: { value: "12,34" } });
    fireEvent.click(screen.getByRole("button", { name: "See my suggestion" }));
    expect(fetchFn).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Credit limit"), { target: { value: "$800" } });
    fireEvent.click(screen.getByRole("button", { name: "See my suggestion" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`${BASE}/suggestion`));
    expect(body(fetchFn, 0)).toEqual({ creditLimitCents: 80000 });
  });
});

describe("S2, A limit to try this month", () => {
  it("shows 30% of the limit and saves it with the star, then returns where the student started", async () => {
    const fetchFn = server([{ status: 200, body: {} }, { status: 201, body: STEP }]);
    render(<SpendLimitSuggestion applicationId={ID} creditLimitCents={50000} suggestedCents={15000} from="home" />);
    expect(screen.getByRole("heading", { level: 1, name: "A limit to try this month" })).toBeTruthy();
    expect(screen.getByText("$500")).toBeTruthy();
    expect(screen.getAllByText("$150")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Pick my own" }).getAttribute("href")).toBe(`${BASE}/pick?from=home`);
    fireEvent.click(screen.getByRole("button", { name: "Use $150" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/home"));
    expect(body(fetchFn, 0)).toEqual({ spendLimitCents: 15000 });
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
  });

  it("shows the API's message when the save fails, and stays", async () => {
    server([{ status: 400, body: { error: { code: "invalid_request", message: "A spend limit can be at most the credit limit." } } }]);
    render(<SpendLimitSuggestion applicationId={ID} creditLimitCents={50000} suggestedCents={15000} from="setup" />);
    fireEvent.click(screen.getByRole("button", { name: "Use $150" }));
    expect((await screen.findByRole("alert")).textContent).toContain("at most the credit limit");
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("S3, Pick your limit", () => {
  const pick = (savedCents: number | null = null) =>
    render(
      <SpendLimitPick
        applicationId={ID}
        creditLimitCents={50000}
        suggestedCents={15000}
        tighterCents={10000}
        savedCents={savedCents}
        from="setup"
      />,
    );

  it("starts on the suggestion, saves a picked choice, and goes back to S2 from its arrow", async () => {
    const fetchFn = server([{ status: 200, body: {} }, { status: 201, body: STEP }]);
    pick();
    expect(screen.getByRole("radio", { name: /\$150 a month, 30% of your limit/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Above $150")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Your suggestion" }).getAttribute("href")).toBe(`${BASE}/suggestion`);
    fireEvent.click(screen.getByRole("radio", { name: /\$100 a month, tighter/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save my limit" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/applications/${ID}/setup`));
    expect(body(fetchFn, 0)).toEqual({ spendLimitCents: 10000 });
  });

  it("takes another amount up to the credit limit, and shows a saved one again", async () => {
    const fetchFn = server([{ status: 200, body: {} }, { status: 201, body: STEP }]);
    const { unmount } = pick();
    const other = screen.getByLabelText("Another amount");
    fireEvent.change(other, { target: { value: "600" } });
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save my limit" }));
    expect(screen.getByText("Enter an amount from $1 to $500.")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
    fireEvent.change(other, { target: { value: "$200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my limit" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(body(fetchFn, 0)).toEqual({ spendLimitCents: 20000 });
    unmount();

    pick(20000);
    expect((screen.getByLabelText("Another amount") as HTMLInputElement).value).toBe("200");
  });
});
