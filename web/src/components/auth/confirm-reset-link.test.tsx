// @vitest-environment jsdom
// Created with Claude Code (2026-11-17). The reset email's confirm screen:
// opening it verifies nothing, Continue does (login CSRF, external audit of a8fe7d4).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmResetLink } from "./confirm-reset-link";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }) }));

function server(...answers: (() => Response)[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => (answers.length > 1 ? answers.shift()! : answers[0])());
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const apiFailure = (status: number, code: string, message: string) => () => Response.json({ error: { code, message } }, { status });

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("ConfirmResetLink", () => {
  it("sends nothing until Continue is tapped", () => {
    const fetchFn = server(() => Response.json({ status: "verified" }));
    render(<ConfirmResetLink link={{ tokenHash: "abc" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("verifies the link on Continue, then opens Set a new password", async () => {
    const fetchFn = server(() => Response.json({ status: "verified" }));
    render(<ConfirmResetLink link={{ tokenHash: "abc" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/auth/password/reset/verify");
    expect(fetchFn.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ tokenHash: "abc" });
  });

  it("sends a used or expired link to Forgot password, which says so", async () => {
    server(apiFailure(401, "invalid_link", "That link has expired or was already used. Ask for a new one."));
    render(<ConfirmResetLink link={{ code: "c1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/forgot-password?error=invalid_link"));
  });

  it("tells a student logged in to another account to log out first, and logs them out", async () => {
    const fetchFn = server(
      apiFailure(409, "signed_in_as_other", "You’re logged in to a different account. Log out, then ask for a new reset link."),
      () => Response.json({ status: "signed_out" }),
    );
    render(<ConfirmResetLink link={{ tokenHash: "someone-elses" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Log out first" })).toBeTruthy();
    expect(screen.getByText("You’re logged in to a different account. Log out, then ask for a new reset link.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/forgot-password"));
    expect(fetchFn.mock.calls[1][0]).toBe("/api/v1/auth/logout");
  });

  it("shows the limit's message and stays put", async () => {
    server(apiFailure(429, "rate_limited", "Too many tries. Try again in 6 minutes."));
    render(<ConfirmResetLink link={{ tokenHash: "abc" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Too many tries. Try again in 6 minutes.");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });
});
