// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResetPassword } from "./reset-password";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }) }));

function server(response: () => Response) {
  const fetchFn = vi.fn<typeof fetch>(async () => response());
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

function submit(password: string, repeat: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: repeat } });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("ResetPassword", () => {
  it("checks the length and the repeat before sending anything", () => {
    const fetchFn = server(() => Response.json({ status: "password_updated" }));
    render(<ResetPassword />);
    submit("short", "short");
    expect(screen.getByRole("alert").textContent).toBe("Use at least 8 characters.");
    submit("long enough", "something else");
    expect(screen.getByRole("alert").textContent).toBe("Let’s make those passwords match.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("saves the new password and sends the student on to /start", async () => {
    const fetchFn = server(() => Response.json({ status: "password_updated" }));
    render(<ResetPassword />);
    submit("long enough", "long enough");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/start"));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/auth/password/reset/confirm");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ password: "long enough" });
  });

  // The route's own answer (reset/confirm/route.ts). The screen used to wait
  // for code "unauthorized", which this route never sends.
  it("says the link has expired when the recovery session is gone", async () => {
    server(() => Response.json({ error: { code: "sign_in_required", message: "A valid reset session is required." } }, { status: 401 }));
    render(<ResetPassword />);
    submit("long enough", "long enough");
    expect(await screen.findByRole("heading", { level: 1, name: "This link has expired" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Send a new link" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("says the link has expired when the session is not from a recent reset link", async () => {
    server(() => Response.json({ error: { code: "recovery_required", message: "Open a password reset link before setting a new password." } }, { status: 403 }));
    render(<ResetPassword />);
    submit("long enough", "long enough");
    expect(await screen.findByRole("heading", { level: 1, name: "This link has expired" })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the API's message when it refuses the password, and stays put", async () => {
    server(() => Response.json({ error: { code: "invalid_password", message: "Use a password of 72 bytes or fewer." } }, { status: 400 }));
    render(<ResetPassword />);
    submit("long enough", "long enough");
    expect((await screen.findByRole("alert")).textContent).toBe("Use a password of 72 bytes or fewer.");
    expect(replace).not.toHaveBeenCalled();
  });
});
