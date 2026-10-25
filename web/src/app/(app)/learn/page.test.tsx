// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LearnPage from "./page";
import PennyPage from "./penny/page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/learn", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ requireStudent: async () => ({ studentId: "s", email: null }) }));

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: true }) as unknown as MediaQueryList);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function screenOf(element: unknown): ReactElement {
  if (!isValidElement(element)) throw new Error("expected a screen");
  return element;
}

const penny = () => PennyPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) } as Parameters<typeof PennyPage>[0]);

// Until ANTHROPIC_API_KEY is set on the server, a typed question can only
// say Penny is unavailable, so neither field shows (audit PEN-07). Starters,
// topics and tapped answers work without it.
describe("Learn and Ask Penny without the Anthropic key", () => {
  it("Learn hides Penny's field and keeps the starters and topics", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    render(screenOf(await LearnPage()));
    expect(screen.queryByRole("textbox", { name: "Ask Penny" })).toBeNull();
    expect(screen.getByRole("link", { name: "How to use a credit card?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Student loans" })).toBeTruthy();
  });

  it("Ask Penny hides its field and still greets with two questions", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    render(screenOf(await penny()));
    expect(screen.queryByRole("textbox", { name: "Ask Penny" })).toBeNull();
    expect(screen.getByRole("button", { name: "How to use a credit card?" })).toBeTruthy();
  });

  it("shows both fields once the key is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
    render(screenOf(await LearnPage()));
    expect(screen.getByRole("textbox", { name: "Ask Penny" })).toBeTruthy();
    cleanup();
    render(screenOf(await penny()));
    expect(screen.getByRole("textbox", { name: "Ask Penny" })).toBeTruthy();
  });
});
