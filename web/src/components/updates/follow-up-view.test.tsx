// @vitest-environment jsdom
// Created with Claude Code (2026-11-26). The follow-up screen (Flow B N3)
// with autopay that pays only part of the statement.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FollowUpView } from "./follow-up-view";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/updates/x", useRouter: () => router }));

const ID = "00000000-0000-4000-8000-0000000000a1";

describe("FollowUpView", () => {
  it("asks for the full balance with no autopay line", () => {
    render(<FollowUpView id={ID} cardName="Discover it" due="Dec 6" choices={[]} />);
    expect(screen.getByText("Paying it in full by Dec 6 avoids interest.")).toBeTruthy();
  });

  it("says autopay covers the minimum, and asks for the rest", () => {
    render(<FollowUpView id={ID} cardName="Discover it" due="Dec 6" autopay="Autopay covers the minimum." choices={[]} />);
    expect(screen.getByText("Autopay covers the minimum. Pay the rest by Dec 6 to avoid interest.")).toBeTruthy();
    expect(screen.queryByText(/Paying it in full/)).toBeNull();
  });
});
