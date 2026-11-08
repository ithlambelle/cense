// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

import { SetupFlow } from "./setup-flow";

afterEach(() => {
  replace.mockClear();
});

// Answers the rent step as "Me", due on the 1st, with the amount typed.
function answerRent(amount: string) {
  render(<SetupFlow step={1} savedBills={[]} savedSetAsideCents={0} answered={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Me" }));
  fireEvent.change(screen.getByLabelText("Your rent each month"), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText("Due on day"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("SetupFlow amounts", () => {
  it("asks again for a rent with misplaced commas instead of reading 12,34 as $1,234", () => {
    answerRent("12,34");
    expect(screen.getByText("Enter an amount, like 650.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("moves on with a rent written with a thousands comma", () => {
    answerRent("$1,234");
    expect(screen.queryByText("Enter an amount, like 650.")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/safe-to-spend/setup?step=2");
  });
});
