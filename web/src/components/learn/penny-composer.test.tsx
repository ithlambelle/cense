// @vitest-environment jsdom
// Created with Claude Code (2026-11-16). Learn's Penny field: it loads Ask
// Penny ahead, and while Ask Penny opens it shows it is working instead of
// looking like nothing happened (QA explorer on a slow network, Nov 16).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let resolvePush: () => void = () => {};
const push = vi.fn(() => new Promise<void>((resolve) => (resolvePush = resolve)));
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch }) }));
vi.mock("@/lib/penny/pending-question", () => ({ handOffQuestion: vi.fn() }));

import { PennyComposer } from "./penny-composer";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PennyComposer on Learn", () => {
  it("loads Ask Penny ahead", () => {
    render(<PennyComposer variant="learn" />);
    expect(prefetch).toHaveBeenCalledWith("/learn/penny");
  });

  it("opens Ask Penny with the question, and the chat field never preloads", async () => {
    render(<PennyComposer variant="learn" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask Penny" }), { target: { value: "Will checking hurt my score?" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Ask Penny" }));
    });
    expect(push).toHaveBeenCalledWith("/learn/penny");
    cleanup();
    prefetch.mockClear();
    render(<PennyComposer variant="chat" onAsk={() => {}} />);
    expect(prefetch).not.toHaveBeenCalled();
    resolvePush();
  });
});
