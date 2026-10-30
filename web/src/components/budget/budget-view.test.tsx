// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { JORDAN_OVER_BUDGET, SAM_WITH_SURPLUS } from "@/lib/budget/personas";

import { BudgetView } from "./budget-view";

afterEach(cleanup);

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const status = () => screen.getByRole("status");

describe("BudgetView", () => {
  it("starts from the persona's numbers", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    expect(screen.getByRole("heading", { level: 1, name: "Your month" })).toBeTruthy();
    expect(status().textContent).toContain("Left over each month");
    expect(status().textContent).toContain("$238");
    expect(status().textContent).toContain("$55 a week");
    expect((screen.getByLabelText("Rent") as HTMLInputElement).value).toBe("700");
    expect((screen.getByLabelText("Pay each paycheck") as HTMLInputElement).value).toBe("480");
  });

  it("says plainly that the numbers are made up and not saved", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    expect(screen.getByText(/Made-up numbers for Sam/).textContent).toContain("nothing here is saved");
  });

  it("recalculates as an amount changes", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    type("Eating out with friends", "100");
    expect(status().textContent).toContain("$338");
    type("Investing", "300");
    expect(status().textContent).toContain("$238");
  });

  it("counts an empty field as $0 without flagging it", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    type("Eating out with friends", "");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status().textContent).toContain("$438");
  });

  it("flags text that is not an amount and holds back the total until it is fixed", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    type("Rent", "seven hundred");
    expect(screen.getByRole("alert").textContent).toBe("Use an amount like 25 or 25.50.");
    expect(screen.getByLabelText("Rent").getAttribute("aria-invalid")).toBe("true");
    expect(status().textContent).toBe("Fix the amounts marked below to see your total.");
    type("Rent", "650");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status().textContent).toContain("$288");
  });

  it("shows a shortfall in words, not just a number", () => {
    render(<BudgetView initial={JORDAN_OVER_BUDGET} personaName="Jordan" />);
    expect(status().textContent).toContain("Short each month by");
    expect(status().textContent).toContain("Your needs and fixed wants alone are more than your income.");
    expect(status().textContent).toContain("short.");
  });

  it("changes the per-paycheck line when the pay schedule changes", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    fireEvent.change(screen.getByLabelText("How often you are paid"), { target: { value: "monthly" } });
    // Paid once a month, there is no per-paycheck sentence, and $480 once a
    // month is far less income than $480 every week.
    expect(status().textContent).not.toContain("That is about");
    expect(status().textContent).toContain("Short each month by");
  });

  it("lays the waterfall out in the template's order", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    const labels = within(screen.getByRole("heading", { name: "How it adds up" }).closest("section")!)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(labels).toEqual([
      "Income",
      "Minus fixed needs",
      "Minus changing needs",
      "Minus fixed wants",
      "Left to decide",
      "Minus changing wants",
      "Minus saving",
      "Left over",
    ]);
  });

  it("resets every field to the example", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    type("Rent", "1");
    type("Pay each paycheck", "oops");
    fireEvent.click(screen.getByRole("button", { name: "Reset to the example" }));
    expect((screen.getByLabelText("Rent") as HTMLInputElement).value).toBe("700");
    expect((screen.getByLabelText("Pay each paycheck") as HTMLInputElement).value).toBe("480");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status().textContent).toContain("$238");
  });

  it("links back to the list of screens", () => {
    render(<BudgetView initial={SAM_WITH_SURPLUS} personaName="Sam" />);
    expect(screen.getByRole("link", { name: "Back to All screens" }).getAttribute("href")).toBe("/dev/screens");
  });
});
