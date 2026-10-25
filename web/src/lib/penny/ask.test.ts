import { afterEach, describe, expect, it, vi } from "vitest";

// "server-only" refuses to load outside a server build; this test is the server.
vi.mock("server-only", () => ({}));

const sdk = vi.hoisted(() => ({ parse: vi.fn(), options: [] as unknown[] }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse: sdk.parse };
    constructor(options: unknown) {
      sdk.options.push(options);
    }
  },
}));

import { findAnswer } from "./answers";
import { askPenny, PENNY_MODEL, PENNY_SYSTEM_PROMPT, replyFrom } from "./ask";
import { PENNY_COPY } from "./copy";

afterEach(() => {
  sdk.parse.mockReset();
});

const model = (over: Record<string, unknown>) => ({ kind: "answer", answerId: null, reply: null, suggestionIds: [], ...over });

describe("replyFrom", () => {
  it("answers with the model's rephrasing and the checked answer's source and topic", () => {
    const reply = replyFrom(model({ answerId: "credit-score", reply: "It's a number from 300 to 850." }) as never);
    expect(reply).toEqual({
      kind: "answer",
      text: "It’s a number from 300 to 850.",
      answer: {
        id: "credit-score",
        question: "What is a credit score?",
        topic: "credit",
        source: findAnswer("credit-score")?.source,
      },
    });
  });

  it("says it has no checked answer when the model picks none", () => {
    expect(replyFrom(model({ answerId: null }) as never)).toMatchObject({ kind: "declined", reason: "unknown", text: PENNY_COPY.unknown });
  });

  it("gives the frame's advice reply with the model's two suggestions", () => {
    const reply = replyFrom(model({ kind: "advice", suggestionIds: ["emergency-fund", "fdic-insurance"] }) as never);
    expect(reply).toEqual({
      kind: "declined",
      reason: "advice",
      text: PENNY_COPY.advice,
      suggestions: [
        { id: "emergency-fund", question: "Why have an emergency fund?" },
        { id: "fdic-insurance", question: "Is my money safe in a bank?" },
      ],
    });
  });

  it("fills suggestions from the starters, never repeating one", () => {
    const reply = replyFrom(model({ kind: "off_topic", suggestionIds: ["using-a-credit-card"] }) as never);
    expect(reply.kind === "declined" && reply.suggestions.map((s) => s.id)).toEqual(["using-a-credit-card", "student-budget"]);
  });

  it("gives the 988 line with nothing else for a crisis", () => {
    expect(replyFrom(model({ kind: "crisis", suggestionIds: ["credit-score"] }) as never)).toEqual({
      kind: "declined",
      reason: "crisis",
      text: PENNY_COPY.crisis,
      suggestions: [],
    });
  });
});

describe("askPenny", () => {
  it("asks Sonnet 5.5 at low effort with the cached checked answers and only the question", async () => {
    sdk.parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: model({ answerId: "credit-score", reply: "A number." }) });
    await askPenny("What is a credit score?");
    const request = sdk.parse.mock.calls[0][0];
    expect(request.model).toBe(PENNY_MODEL);
    expect(PENNY_MODEL).toBe("claude-sonnet-5-5");
    expect(request.output_config.effort).toBe("low");
    expect(request.system).toEqual([{ type: "text", text: PENNY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(request.messages).toEqual([{ role: "user", content: "Student question: What is a credit score?" }]);
    expect(sdk.options[0]).toMatchObject({ timeout: 15_000, maxRetries: 1 });
  });

  it("keeps the system prompt the same on every call, so the cache holds", () => {
    expect(PENNY_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    for (const id of ["credit-score", "fafsa", "fdic-insurance"]) expect(PENNY_SYSTEM_PROMPT).toContain(`"id":"${id}"`);
  });

  it("gives the off-topic reply when the model declines for safety", async () => {
    sdk.parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    expect(await askPenny("something")).toMatchObject({ kind: "declined", reason: "off_topic" });
  });

  it("throws when the reply cannot be read, so the route says Penny is unavailable", async () => {
    sdk.parse.mockResolvedValue({ stop_reason: "max_tokens", parsed_output: null });
    await expect(askPenny("something")).rejects.toThrow(/did not parse/);
  });
});
