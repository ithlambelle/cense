// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NoLetterView } from "./no-letter-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/denied/no-letter", useRouter: () => ({ push: vi.fn() }) }));

const ID = "00000000-0000-4000-8000-000000000001";

describe("NoLetterView", () => {
  it("says the letter can take up to 30 days and offers one way on, back to Home", () => {
    render(<NoLetterView applicationId={ID} />);
    expect(screen.getByRole("heading", { level: 1, name: "No problem" })).toBeTruthy();
    expect(screen.getByText(/Letters can take up to 30 days\./)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Keep an eye on mail and email" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" }).getAttribute("href")).toBe("/home");
  });

  it("goes back to this card's denial options", () => {
    render(<NoLetterView applicationId={ID} />);
    expect(screen.getByRole("link", { name: "Back to Denial options" }).getAttribute("href")).toBe(`/denied?application=${ID}`);
  });
});
