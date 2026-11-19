// @vitest-environment jsdom
// Created with Claude Code (2026-11-18). "Link your bank" (Flow 5 C1, Figma
// 821:9643) as a student reads it, and its button still opening Plaid Link.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
const createLinkToken = vi.fn();
const linkBank = vi.fn();
vi.mock("@/lib/api-client/safe-to-spend", () => ({
  createLinkToken: (...args: unknown[]) => createLinkToken(...args),
  linkBank: (...args: unknown[]) => linkBank(...args),
}));
const openLink = vi.fn();
vi.mock("@/lib/plaid/link", () => ({ openLink: (...args: unknown[]) => openLink(...args) }));

import { ConnectView } from "./connect-view";

afterEach(() => {
  vi.clearAllMocks();
});

describe("ConnectView", () => {
  it("shows the frame's title, subtitle and three titled rows", () => {
    render(<ConnectView />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Link your bank");
    expect(screen.getByText("So Cense can find your next step and what’s safe to spend.")).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: "What Cense reads and keeps" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Read onlyWe read balances and keep up to 2 years of transactions to find your bills and income. We can’t move money.",
      "PrivateWe never see your bank login.",
      "Yours to deleteDisconnect anytime and we delete it all.",
    ]);
  });

  it("offers Link your bank, Skip for now to Home, and no back arrow", () => {
    render(<ConnectView />);
    expect(screen.getByRole("button", { name: "Link your bank" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Skip for now" }).getAttribute("href")).toBe("/home");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("says Secured by Plaid and keeps the Preview and sandbox note, with no Privacy Policy line yet", () => {
    const { container } = render(<ConnectView />);
    expect(screen.getByText("Secured by Plaid.")).toBeTruthy();
    expect(screen.getByText("Preview")).toBeTruthy();
    expect(screen.getByText("Sandbox only, no live data")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Privacy Policy|agree/);
  });

  it("opens Plaid Link with the server's token, then goes on to the questions", async () => {
    createLinkToken.mockResolvedValue({ kind: "ok", data: { linkToken: "link-sandbox-1" } });
    openLink.mockResolvedValue({ kind: "connected", publicToken: "public-sandbox-1" });
    linkBank.mockResolvedValue({ kind: "ok", data: {} });
    render(<ConnectView />);
    fireEvent.click(screen.getByRole("button", { name: "Link your bank" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/safe-to-spend/setup"));
    expect(openLink).toHaveBeenCalledWith("link-sandbox-1");
    expect(linkBank).toHaveBeenCalledWith("public-sandbox-1");
  });

  it("stays on the screen and says so when the student closes Link", async () => {
    createLinkToken.mockResolvedValue({ kind: "ok", data: { linkToken: "link-sandbox-1" } });
    openLink.mockResolvedValue({ kind: "cancelled" });
    render(<ConnectView />);
    fireEvent.click(screen.getByRole("button", { name: "Link your bank" }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "No bank connected. Try again when you’re ready.");
    expect(linkBank).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
