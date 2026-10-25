// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// The real track(), which checks every event against the catalog, watched.
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  analytics.track.mockImplementation(actual.track);
  return { ...actual, track: analytics.track };
});

import { NO_CAPTURE, SENSITIVE_SELECTOR } from "@/lib/analytics-config";
import { findAnswer } from "@/lib/penny/answers";
import { PENNY_COPY } from "@/lib/penny/copy";
import { handOffQuestion } from "@/lib/penny/pending-question";

import { PennyChat } from "./penny-chat";

const BACK = { href: "/learn", label: "Learn" };
const preapproval = findAnswer("preapproval-vs-applying")!;

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function pennyMessages() {
  return within(screen.getByRole("log", { name: "Conversation with Penny" })).getAllByRole("article", { name: "Penny" });
}

async function type(question: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Ask Penny" }), { target: { value: question } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  });
}

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: true }) as unknown as MediaQueryList);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  analytics.track.mockClear();
});

describe("PennyChat", () => {
  it("opens with a tapped question's checked answer, its source, and a link into its topic", () => {
    render(<PennyChat canType initialAnswerId={preapproval.id} from="learn" back={BACK} />);
    expect(screen.getByRole("article", { name: "You" }).textContent).toBe("Preapproval vs. applying");
    const answer = pennyMessages()[0];
    expect(answer.textContent).toContain(preapproval.answer);
    const source = within(answer).getByRole("link", { name: "Source: CFPB" });
    expect(source.getAttribute("href")).toBe(preapproval.source.url);
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(answer).getByRole("link", { name: /More about credit/ }).getAttribute("href")).toBe("/learn/credit");
    expect(screen.getByText(PENNY_COPY.disclaimer)).toBeTruthy();
  });

  it("leaves out the topic link when opened from that topic", () => {
    render(<PennyChat canType initialAnswerId={preapproval.id} from="credit" back={BACK} />);
    expect(screen.queryByRole("link", { name: /More about credit/ })).toBeNull();
  });

  it("masks what the student typed, and Penny's reply, in session replay", async () => {
    vi.stubGlobal("fetch", reply(200, { kind: "answer", text: "It’s a soft inquiry.", answer: { ...preapproval } }));
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("I'm jordan@bu.edu, does preapproval hurt my score?");
    // The question shows the moment Send is tapped, before any scrubbing.
    expect(screen.getByText("I'm jordan@bu.edu, does preapproval hurt my score?").closest(SENSITIVE_SELECTOR)).not.toBeNull();
    expect(screen.getByText("It’s a soft inquiry.").closest(SENSITIVE_SELECTOR)).not.toBeNull();
  });

  it("greets with two questions when opened with nothing, and a tapped one answers at once", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    const greeting = pennyMessages()[0];
    expect(greeting.textContent).toContain(PENNY_COPY.greetingTitle);
    fireEvent.click(within(greeting).getByRole("button", { name: "How to use a credit card?" }));
    expect(pennyMessages().at(-1)?.textContent).toContain(findAnswer("using-a-credit-card")!.answer);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Send off until there is something to send", () => {
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    const send = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask Penny" }), { target: { value: "  " } });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask Penny" }), { target: { value: "What is APR?" } });
    expect(send.disabled).toBe(false);
  });

  it("sends a typed question and shows the reply", async () => {
    const fetch = reply(200, { kind: "answer", text: "It’s a soft inquiry.", answer: { ...preapproval } });
    vi.stubGlobal("fetch", fetch);
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("Does preapproval hurt my score?");
    expect(fetch).toHaveBeenCalledWith("/api/v1/penny", expect.objectContaining({ method: "POST", body: JSON.stringify({ question: "Does preapproval hurt my score?" }) }));
    expect(pennyMessages().at(-1)?.textContent).toContain("It’s a soft inquiry.");
  });

  it("sends a question typed on Learn on arrival, with no greeting first", async () => {
    const fetch = reply(200, { kind: "declined", reason: "off_topic", text: PENNY_COPY.offTopic, suggestions: [] });
    vi.stubGlobal("fetch", fetch);
    handOffQuestion("What's the weather?");
    await act(async () => {
      render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    });
    expect(screen.getByRole("article", { name: "You" }).textContent).toBe("What's the weather?");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(pennyMessages()).toHaveLength(1);
    expect(pennyMessages()[0].textContent).toContain(PENNY_COPY.offTopic);
  });

  it("says when the daily limit is reached and offers tapped questions", async () => {
    vi.stubGlobal("fetch", reply(429, { error: { code: "penny_limit", message: "Limit" } }));
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("What is APR?");
    const limit = pennyMessages().at(-1)!;
    expect(limit.textContent).toContain(PENNY_COPY.limit);
    expect(within(limit).getAllByRole("button").map((b) => b.textContent)).toEqual(["How to use a credit card?", "How to budget as a student?"]);
  });

  it("offers Try again when Penny is unavailable, and only on the newest message", async () => {
    vi.stubGlobal("fetch", reply(503, { error: { code: "penny_unavailable", message: "Down" } }));
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("What is APR?");
    expect(pennyMessages().at(-1)?.textContent).toContain(PENNY_COPY.unavailable);
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    await type("And a secured card?");
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
  });

  it("asks a signed-out student to sign in again and come back here", async () => {
    vi.stubGlobal("fetch", reply(401, { error: { code: "unauthorized", message: "Sign in to continue." } }));
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("What is APR?");
    expect(pennyMessages().at(-1)?.textContent).toContain(PENNY_COPY.signedOut);
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/sign-in?next=%2Flearn%2Fpenny");
  });
});

// The 988 line, one tap from a call or a text.
function expectCrisisLine(message: HTMLElement) {
  expect(message.textContent).toContain(PENNY_COPY.crisis);
  expect(within(message).getByRole("link", { name: "Call 988" }).getAttribute("href")).toBe("tel:988");
  expect(within(message).getByRole("link", { name: "Text 988" }).getAttribute("href")).toBe("sms:988");
}

describe("PennyChat in a crisis", () => {
  it.each([
    ["with Penny unavailable", () => reply(503, { error: { code: "penny_unavailable", message: "Down" } })],
    ["at the daily limit", () => reply(429, { error: { code: "penny_limit", message: "Limit" } })],
    ["signed out", () => reply(401, { error: { code: "unauthorized", message: "Sign in to continue." } })],
    [
      "offline",
      () =>
        vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        }),
    ],
  ])("shows the 988 line %s, before anything is sent", async (_state, server) => {
    const fetch = server();
    vi.stubGlobal("fetch", fetch);
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("im going to kill my self");
    expect(fetch).not.toHaveBeenCalled();
    expectCrisisLine(pennyMessages().at(-1)!);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows it for a question typed on Learn, on arrival, with nothing sent", async () => {
    const fetch = reply(503, { error: { code: "penny_unavailable", message: "Down" } });
    vi.stubGlobal("fetch", fetch);
    handOffQuestion("kms");
    await act(async () => {
      render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(pennyMessages()).toHaveLength(1);
    expectCrisisLine(pennyMessages()[0]);
  });

  it("shows the same tappable line when the model flags a crisis the check missed", async () => {
    vi.stubGlobal("fetch", reply(200, { kind: "declined", reason: "crisis", text: PENNY_COPY.crisis, suggestions: [] }));
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("Someone is threatening me over money I owe");
    expectCrisisLine(pennyMessages().at(-1)!);
  });
});

describe("PennyChat analytics", () => {
  it("blocks the whole conversation from replay, so a crisis leaves no box of its own", async () => {
    vi.stubGlobal("fetch", reply(503, { error: { code: "penny_unavailable", message: "Down" } }));
    render(<PennyChat canType initialAnswerId={preapproval.id} from="learn" back={BACK} />);
    const log = screen.getByRole("log", { name: "Conversation with Penny" });
    expect(log.classList.contains(NO_CAPTURE)).toBe(true);
    await type("kms");
    expectCrisisLine(pennyMessages().at(-1)!);
    // One blocked box, the same for every conversation.
    expect([...document.querySelectorAll(`.${NO_CAPTURE}`)]).toEqual([log]);
  });

  it("counts a typed answer with only its catalog id", async () => {
    vi.stubGlobal("fetch", reply(200, { kind: "answer", text: "It’s a soft inquiry.", answer: { ...preapproval } }));
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("Does preapproval hurt my score?");
    expect(analytics.track).toHaveBeenCalledWith("penny_question_asked", { source: "typed", outcome: "answered", answer_id: preapproval.id });
  });

  it("sends nothing about a crisis, and keeps the 988 line out of replay and autocapture", async () => {
    // Students are identified by their user id, so a crisis event or a
    // recorded 988 line would tie a self-harm flag to a person (PEN-06).
    vi.stubGlobal("fetch", reply(200, { kind: "declined", reason: "crisis", text: PENNY_COPY.crisis, suggestions: [] }));
    render(<PennyChat canType initialAnswerId={null} from={null} back={BACK} />);
    await type("kms");
    await type("Someone is threatening me over money I owe");
    expect(analytics.track).not.toHaveBeenCalled();
    const crises = pennyMessages().slice(1);
    expect(crises).toHaveLength(2);
    for (const message of crises) {
      expectCrisisLine(message);
      expect(message.closest(`.${NO_CAPTURE}`)).not.toBeNull();
    }
  });
});
