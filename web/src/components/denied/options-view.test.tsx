// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeniedOptionsView } from "@/components/denied/options-view";
import { OFFLINE_MESSAGE } from "@/lib/api-client/client";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/denied", useRouter: () => ({ push, replace }) }));

const ID = "00000000-0000-4000-8000-000000000001";
const PATCH_URL = `/api/v1/applications/${ID}`;

// Each request takes the next reply. A reply can be held until the test lets it go.
function server(replies: ({ status: number; body: unknown } | Promise<{ status: number; body: unknown }> | "offline")[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = await replies.shift();
    if (!reply) throw new Error("unexpected request");
    if (reply === "offline") throw new TypeError("Failed to fetch");
    return Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const saved = { status: 200, body: {} };
const sentBody = (fetchFn: ReturnType<typeof server>, call = 0) => JSON.parse(String(fetchFn.mock.calls[call][1]?.body));

function chooseReason(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Yes, I know the reason" }));
  fireEvent.click(screen.getByRole("button", { name }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  replace.mockClear();
});

describe("DeniedOptionsView", () => {
  it("asks whether the issuer said why, and links the mistake answer to the issuer screen", () => {
    render(<DeniedOptionsView applicationId={ID} />);
    expect(screen.getByRole("heading", { name: "Did the issuer tell you why?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "I think it was a mistake" }).getAttribute("href")).toBe(`/denied/fixable?application=${ID}`);
    expect(screen.queryByText(/No credit file/)).toBeNull();
  });

  it("saves no_letter_yet, then opens No problem", async () => {
    const fetchFn = server([saved]);
    render(<DeniedOptionsView applicationId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Not yet, I’m waiting on the letter" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/denied/no-letter?application=${ID}`));
    expect(fetchFn.mock.calls[0][0]).toBe(PATCH_URL);
    expect(fetchFn.mock.calls[0][1]?.method).toBe("PATCH");
    expect(sentBody(fetchFn)).toEqual({ denialReason: "no_letter_yet", denialReasonNote: null });
  });

  it("stays put and says why when no_letter_yet fails to save, and tapping again retries", async () => {
    server(["offline", saved]);
    render(<DeniedOptionsView applicationId={ID} />);
    const notYet = screen.getByRole("button", { name: "Not yet, I’m waiting on the letter" });
    fireEvent.click(notYet);
    expect((await screen.findByRole("alert")).textContent).toContain(OFFLINE_MESSAGE);
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(notYet);
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/denied/no-letter?application=${ID}`));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reveals the reason question on the same page and moves focus to it", () => {
    render(<DeniedOptionsView applicationId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes, I know the reason" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Was it one of these?" }));
    expect(screen.queryByRole("link", { name: "I think it was a mistake" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
  });

  it.each([
    ["Not enough credit history", "no_credit_history"],
    ["Not enough income", "income"],
    ["Couldn’t verify my identity", "could_not_verify"],
  ])("saves %s as %s, then opens the plan", async (label, value) => {
    const fetchFn = server([saved]);
    render(<DeniedOptionsView applicationId={ID} />);
    chooseReason(label);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/denied/plan?application=${ID}`));
    expect(sentBody(fetchFn)).toEqual({ denialReason: value, denialReasonNote: null });
  });

  it("saves Something else with the trimmed note, showing the button busy until the save answers", async () => {
    let answer: (reply: { status: number; body: unknown }) => void = () => undefined;
    const fetchFn = server([new Promise((resolve) => (answer = resolve))]);
    render(<DeniedOptionsView applicationId={ID} />);
    chooseReason("Something else");
    fireEvent.change(screen.getByLabelText("What did the letter say?"), { target: { value: "  Too many recent applications " } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Continue" }).getAttribute("aria-busy")).toBe("true");
    expect(push).not.toHaveBeenCalled();
    answer(saved);
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/denied/plan?application=${ID}`));
    expect(sentBody(fetchFn)).toEqual({ denialReason: "something_else", denialReasonNote: "Too many recent applications" });
  });

  it("never moves on after a failed save: it shows the API's message, and Continue tries again", async () => {
    server([
      { status: 503, body: { error: { code: "data_unavailable", message: "Your data is temporarily unavailable. Please try again." } } },
      saved,
    ]);
    render(<DeniedOptionsView applicationId={ID} />);
    chooseReason("Not enough income");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your data is temporarily unavailable. Please try again.");
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/denied/plan?application=${ID}`));
  });

  it("sends a student whose session ended to sign in", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<DeniedOptionsView applicationId={ID} />);
    chooseReason("Not enough income");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
    expect(push).not.toHaveBeenCalled();
  });

  it("moves on without saving when there is no card to save against", async () => {
    const fetchFn = server([]);
    render(<DeniedOptionsView applicationId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Not yet, I’m waiting on the letter" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/denied/no-letter"));
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
