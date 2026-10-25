// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeniedOptionsView } from "@/components/denied/options-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/denied", useRouter: () => ({ push }) }));

const ID = "00000000-0000-4000-8000-000000000001";

describe("DeniedOptionsView", () => {
  it("asks whether the issuer said why and routes the other two answers", () => {
    render(<DeniedOptionsView applicationId={ID} />);
    expect(screen.getByRole("heading", { name: "Did the issuer tell you why?" })).toBeTruthy();
    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Not yet, I’m waiting on the letter")).toBe(`/denied/plan?application=${ID}`);
    expect(href("I think it was a mistake")).toBe(`/denied/fixable?application=${ID}`);
    expect(screen.queryByText(/No credit file/)).toBeNull();
  });

  it("reveals the reason question on the same page and continues to the plan", () => {
    render(<DeniedOptionsView applicationId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes, I know the reason" }));
    const question = screen.getByRole("heading", { name: "Was it one of these?" });
    expect(document.activeElement).toBe(question);
    expect(screen.queryByRole("link", { name: "I think it was a mistake" })).toBeNull();

    const next = screen.getByRole("button", { name: "Continue" });
    expect(next.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Something else" }));
    fireEvent.change(screen.getByLabelText("What did the letter say?"), { target: { value: "Too many recent applications" } });
    fireEvent.click(next);
    expect(push).toHaveBeenCalledWith(`/denied/plan?application=${ID}`);
  });
});
