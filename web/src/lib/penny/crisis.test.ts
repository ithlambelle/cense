import { describe, expect, it } from "vitest";

import { isCrisis } from "./crisis";

describe("isCrisis", () => {
  it.each([
    // Caught before the audit.
    "I want to die",
    "thinking about suicide",
    "I might hurt myself",
    "my debt makes me want to kill myself",
    "I don't want to live anymore",
    // Missed before the audit (PEN-04, Oct 25 2026).
    "im going to kill my self",
    "kms",
    "honestly kms after that bill",
    "I want to unalive myself",
    "I want to take my own life",
    "I wish I was dead",
    "I'd be better off dead",
    "I don’t want to be here anymore",
    "I can't go on",
    "I can’t go on like this.",
    "I can't go on like this with my debt",
    "i cant go on anymore with these loans",
    "wanna die",
    "I do not want to live",
    "I've been self-harming",
    "self harm",
    "I cut myself",
    "I keep cutting myself",
    "I want to hurt someone",
    "thinking of overdosing",
    "there's no reason to live",
    "I   want  to   die",
  ])("flags %j", (text) => {
    expect(isCrisis(text)).toBe(true);
  });

  it.each([
    "My card died",
    "how do I kill my debt fast",
    "Will this hurt my score?",
    "end my card's autopay",
    "Does cosigning hurt someone's credit?",
    "I can't go on vacation this year, can I?",
    "I drive 20 kms to campus, can I write off gas?",
    "What is an overdraft fee?",
    "How do I cut my spending?",
  ])("does not flag %j", (text) => {
    expect(isCrisis(text)).toBe(false);
  });
});
