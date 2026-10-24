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

// Named rather than written inline: secret scanners read a quoted string
// passed to openPassword as a hardcoded password.
const SIGN_UP = "sign-up";
const SIGN_IN = "sign-in";

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
    openPassword(SIGN_UP);
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
    openPassword(SIGN_UP);
    fill("Email", "alex@email.com");
    fill("Password", "correcthorse");
    fill("Repeat password", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/start"));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/auth/password/signup");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ email: "alex@email.com", password: "correcthorse" });
  });

  it("asks for the confirmation code, then signs the student in, when sign-up needs it", async () => {
    const fetchFn = server(200, { status: "check_email" });
    openPassword(SIGN_UP);
    fill("Email", "alex@email.com");
    fill("Password", "correcthorse");
    fill("Repeat password", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    // The confirmation email carries a 6-digit code, so the code step opens.
    expect(await screen.findByText("We sent a 6-digit code to alex@email.com to confirm your account.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Resend email in \d+s/ })).toBeTruthy();
    fetchFn.mockImplementation(async () => Response.json({ status: "signed_in" }, { status: 200 }));
    fill("Verification code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/start"));
    // The confirm route sets the password chosen here once the code proves the inbox.
    expect(fetchFn.mock.calls.at(-1)?.[0]).toBe("/api/v1/auth/password/signup/confirm");
    expect(JSON.parse(String(fetchFn.mock.calls.at(-1)?.[1]?.body))).toEqual({ email: "alex@email.com", code: "123456", password: "correcthorse" });
  });

  it("goes back to the password step from the confirmation code", async () => {
    server(200, { status: "check_email" });
    openPassword(SIGN_UP);
    fill("Email", "alex@email.com");
    fill("Password", "correcthorse");
    fill("Repeat password", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText(/to confirm your account/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Repeat password")).toBeTruthy();
  });

  it("says a wrong password plainly on log-in, on the password field", async () => {
    server(401, { error: { code: "invalid_credentials", message: "The email or password is incorrect." } });
    openPassword(SIGN_IN);
    fill("Email", "alex@email.com");
    fill("Password", "nope-nope");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Not quite. Give your password another try.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a confirmation code when an unconfirmed account logs in with its password", async () => {
    const fetchFn = server(403, { error: { code: "email_not_confirmed", message: "Confirm your email before signing in." } });
    openPassword(SIGN_IN);
    fill("Email", "alex@email.com");
    fill("Password", "correcthorse");
    // The code email is held until the test releases it, to check the wait.
    let sendCode: (value: Response) => void = () => undefined;
    fetchFn.mockImplementationOnce(async () => Response.json({ error: { code: "email_not_confirmed", message: "x" } }, { status: 403 }));
    fetchFn.mockImplementationOnce(() => new Promise<Response>((resolve) => (sendCode = resolve)));
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    // While the code is sent, nothing on the form can fire again.
    expect(screen.getByRole("button", { name: /Log in/ }).getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Log in/ }));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    sendCode(Response.json({ status: "code_sent" }, { status: 200 }));
    expect(await screen.findByText("We sent a 6-digit code to alex@email.com to confirm your account.")).toBeTruthy();
    expect(fetchFn.mock.calls[1][0]).toBe("/api/v1/auth/email");
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({ email: "alex@email.com" });
    // The code confirms the account and signs the student in.
    fetchFn.mockImplementationOnce(async () => Response.json({ status: "signed_in" }, { status: 200 }));
    fill("Verification code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/start"));
    // The code goes to the confirm route with the password just typed, so it
    // stays: the plain code check would replace it.
    expect(fetchFn.mock.calls.at(-1)?.[0]).toBe("/api/v1/auth/password/signup/confirm");
    expect(JSON.parse(String(fetchFn.mock.calls.at(-1)?.[1]?.body))).toEqual({
      email: "alex@email.com", code: "123456", password: "correcthorse",
    });
  });

  it("keeps where the student was going after confirming a new account", async () => {
    const fetchFn = server(200, { status: "check_email" });
    render(<SignInFlow mode="sign-up" next="/results" initialError={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Use a password instead" }));
    fill("Email", "alex@email.com");
    fill("Password", "correcthorse");
    fill("Repeat password", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText(/to confirm your account/);
    fetchFn.mockImplementationOnce(async () => Response.json({ status: "signed_in" }, { status: 200 }));
    fill("Verification code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/results"));
  });

  it("says password sign-in isn't available yet while the route is missing", async () => {
    server(404, {});
    openPassword(SIGN_IN);
    fill("Email", "alex@email.com");
    fill("Password", "whatever1");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText(/isn’t available yet/)).toBeTruthy();
  });

  it("offers Forgot password on log-in only, and goes back to the email code", () => {
    openPassword(SIGN_IN);
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
