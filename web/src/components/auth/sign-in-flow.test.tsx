// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInFlow } from "./sign-in-flow";

const replace = vi.fn();
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function server(replies: { status: number; body: unknown }[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const CODE_SENT = { status: 200, body: { status: "code_sent" } };
const SIGNED_IN = { status: 200, body: { status: "signed_in" } };
const WRONG_CODE = { status: 401, body: { error: { code: "invalid_code", message: "The code is wrong or expired. Request a new one." } } };

async function reachCodeStep() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: " student@example.edu " } });
  fireEvent.click(screen.getByRole("button", { name: "Send email code" }));
  await screen.findByRole("heading", { name: "Check your email" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("SignInFlow", () => {
  it("offers Google first, pointed at an allowed place to return to", () => {
    render(<SignInFlow next="/quiz" initialError={null} />);
    const google = screen.getByRole("link", { name: "Continue with Google" });
    expect(google.getAttribute("href")).toBe("/api/v1/auth/google?next=%2Fquiz");
  });

  it("shows a cancelled Google sign-in as its own message, not as an email error", () => {
    render(<SignInFlow next={null} initialError="Google sign-in was cancelled." />);
    expect(screen.getByRole("alert").textContent).toBe("Google sign-in was cancelled.");
    expect(screen.getByLabelText("Email").hasAttribute("aria-invalid")).toBe(false);
  });

  it("sends the trimmed email in the request body and never in the address", async () => {
    const fetchFn = server([CODE_SENT]);
    render(<SignInFlow next={null} initialError={null} />);
    await reachCodeStep();
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/auth/email");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ email: "student@example.edu" });
    expect(window.location.href).not.toContain("student");
    expect(screen.getByText("Sent to student@example.edu")).toBeTruthy();
  });

  it("verifies the code and goes to the allowed next place", async () => {
    const fetchFn = server([CODE_SENT, SIGNED_IN]);
    render(<SignInFlow next="/quiz" initialError={null} />);
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "482916" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/quiz"));
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({ email: "student@example.edu", code: "482916" });
  });

  it("goes to the landing check when no next was given", async () => {
    server([CODE_SENT, SIGNED_IN]);
    render(<SignInFlow next={null} initialError={null} />);
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "482916" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/start"));
  });

  it("shows a plain message for a wrong or expired code and stays on the screen", async () => {
    server([CODE_SENT, WRONG_CODE]);
    render(<SignInFlow next={null} initialError={null} />);
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The code is wrong or expired. Request a new one.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps Verify off until six digits are entered", async () => {
    server([CODE_SENT]);
    render(<SignInFlow next={null} initialError={null} />);
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "4829" } });
    expect(screen.getByRole("button", { name: "Verify" }).hasAttribute("disabled")).toBe(true);
  });

  it("holds the resend control during the cooldown", async () => {
    const fetchFn = server([CODE_SENT]);
    render(<SignInFlow next={null} initialError={null} />);
    await reachCodeStep();
    const resend = screen.getByRole("button", { name: /Send a new code in \d+s/ });
    expect(resend.hasAttribute("disabled")).toBe(true);
    fireEvent.click(resend);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not let Back then Send skip the cooldown", async () => {
    const fetchFn = server([CODE_SENT]);
    render(<SignInFlow next={null} initialError={null} />);
    await reachCodeStep();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const send = screen.getByRole("button", { name: /Send a new code in \d+s/ });
    expect(send.hasAttribute("disabled")).toBe(true);
    fireEvent.click(send);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("starts the wait when a send gets no answer, since the code may have gone out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<SignInFlow next={null} initialError={null} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "Send email code" }));
    const send = await screen.findByRole("button", { name: /Send a new code in \d+s/ });
    expect(send.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("connection");
  });

  it("locks Back while a code is being checked, so the answer lands on the right screen", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        call += 1;
        if (call === 1) return Response.json(CODE_SENT.body, { status: 200 });
        await held;
        return Response.json(WRONG_CODE.body, { status: 401 });
      }),
    );
    render(<SignInFlow next={null} initialError={null} />);
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(screen.getByRole("button", { name: "Back" }).hasAttribute("disabled")).toBe(true);
    release();
    expect((await screen.findByRole("alert")).textContent).toContain("wrong or expired");
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy();
  });

  it("asks for nothing but an email", () => {
    render(<SignInFlow next={null} initialError={null} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
