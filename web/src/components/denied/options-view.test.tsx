// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeniedOptionsView } from "@/components/denied/options-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/denied" }));

const ID = "00000000-0000-4000-8000-000000000001";

describe("DeniedOptionsView", () => {
  it("asks about the letter and sends only a wrong-looking reason to the second-look path", () => {
    render(<DeniedOptionsView applicationId={ID} />);
    expect(screen.getByRole("heading", { name: "Does the reason in the issuer’s letter look right?" })).toBeTruthy();
    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Yes, it looks right")).toBe(`/denied/plan?application=${ID}`);
    expect(href("I don’t have the letter yet")).toBe(`/denied/plan?application=${ID}`);
    expect(href("Something looks wrong")).toBe(`/denied/fixable?application=${ID}`);
  });
});
