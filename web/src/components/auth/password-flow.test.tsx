// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ForgotPassword } from "./forgot-password";
import { SignInFlow } from "./sign-in-flow";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));

function server(status: number, body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

function openPassword(mode: "sign-in" | "sign-up") {
  render(<SignInFlow mode={mode} next={null} initialError={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Use a password instead" }));
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("password sign-up and log-in", () => {
  it("asks for 8 characters with no number rule, then for matching passwords", () => {
    const fetchFn = server(200, { status: "signed_in" });
    openPassword("sign-up");
    fill("Email", "alex@email.com");
    fill("Password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    fill("Password", "correcthorse");
    fill("Repeat password", "correcthors");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByText("Let’s make those passwords match.")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("signs up and goes to the landing check", async () => {
    const fetchFn = server(200, { status: "signed_in" });
    openPassword("sign-up");
    fill("Email", "alex@email.com");
    fill("Password", "correcthorse");
    fill("Repeat password", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/start"));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/auth/password/signup");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ email: "alex@email.com", password: "correcthorse" });
  });

  it("asks the student to confirm their email when sign-up needs it", async () => {
    server(200, { status: "check_email" });
    openPassword("sign-up");
    fill("Email", "alex@email.com");
    fill("Password", "correcthorse");
    fill("Repeat password", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText(/Open it to confirm your account/)).toBeTruthy();
  });

  it("says a wrong password plainly on log-in, on the password field", async () => {
    server(401, { error: { code: "invalid_credentials", message: "The email or password is incorrect." } });
    openPassword("sign-in");
    fill("Email", "alex@email.com");
    fill("Password", "nope-nope");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Not quite. Give your password another try.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("says password sign-in isn't available yet while the route is missing", async () => {
    server(404, {});
    openPassword("sign-in");
    fill("Email", "alex@email.com");
    fill("Password", "whatever1");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText(/isn’t available yet/)).toBeTruthy();
  });

  it("offers Forgot password on log-in only, and goes back to the email code", () => {
    openPassword("sign-in");
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
    fireEvent.click(screen.getByRole("button", { name: "Email me a code instead" }));
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeTruthy();
  });
});

describe("ForgotPassword", () => {
  it("gives the same answer whether or not an account uses the email", async () => {
    server(200, { status: "check_email" });
    render(<ForgotPassword />);
    fill("Email", "alex@email.com");
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    expect((await screen.findByRole("status")).textContent).toContain("If an account uses alex@email.com");
  });
});
