// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CodeInput, digitsOnly } from "./code-input";
import { TextField } from "./text-field";

describe("TextField", () => {
  it("ties the label to the input", () => {
    render(<TextField label="Email" />);
    expect(screen.getByLabelText("Email").tagName).toBe("INPUT");
  });

  it("marks the input invalid and announces the error", () => {
    render(<TextField label="Email" hint="A hint." error="That email doesn’t look quite right." />);
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ");
    const texts = described.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(["A hint.", "That email doesn’t look quite right."]);
    expect(screen.getByRole("alert").textContent).toBe("That email doesn’t look quite right.");
  });

  it("is not marked invalid without an error", () => {
    render(<TextField label="Email" />);
    expect(screen.getByLabelText("Email").hasAttribute("aria-invalid")).toBe(false);
  });

  it("stays focusable while disabled: read-only and announced as disabled", () => {
    render(<TextField label="Email" disabled />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("CodeInput", () => {
  it("keeps six digits from whatever is typed or pasted", () => {
    expect(digitsOnly("482 916")).toBe("482916");
    expect(digitsOnly("482-916-777")).toBe("482916");
    expect(digitsOnly("abc")).toBe("");
  });

  it("reports only digits and lets the browser fill a one-time code", () => {
    const onChange = vi.fn();
    render(<CodeInput value="" onChange={onChange} />);
    const input = screen.getByLabelText("Verification code");
    fireEvent.change(input, { target: { value: "48 29a16" } });
    expect(onChange).toHaveBeenCalledWith("482916");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
  });
});
