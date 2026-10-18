// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountView } from "./account-view";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/settings", useRouter: () => ({ replace: vi.fn(), refresh }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("AccountView", () => {
  it("shows the email, the tracked card with its limit, and the account links", () => {
    render(
      <AccountView
        email="student@example.edu"
        card={{
          id: "00000000-0000-4000-8000-000000000001",
          cardId: null,
          cardName: "Sample Bank Card",
          status: "approved",
          creditLimitCents: 50000,
          appliedAt: null,
          statusUpdatedAt: "2026-10-16T00:00:00Z",
        }}
      />,
    );
    expect(screen.getByText("student@example.edu")).toBeTruthy();
    expect(screen.getByText("Approved, $500 limit")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Card quiz results" }).getAttribute("href")).toBe("/results");
    expect(screen.getByRole("link", { name: "Add a card I already have" }).getAttribute("href")).toBe("/home/add-card");
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("invites the student to start when no card is tracked", () => {
    render(<AccountView email={null} card={null} />);
    expect(screen.getByText(/No card tracked yet/)).toBeTruthy();
  });

  it("shows the student's name as the title when they have added one", () => {
    render(<AccountView email="student@example.edu" name="Maya" card={null} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Maya");
    expect((screen.getByLabelText("Your name (optional)") as HTMLInputElement).value).toBe("Maya");
  });

  it("saves a new name, trimmed, and refreshes the page", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "00000000-0000-4000-8000-000000000001", email: null, name: "Maya" }),
    );
    vi.stubGlobal("fetch", fetchFn);
    render(<AccountView email={null} card={null} />);
    const save = screen.getByRole("button", { name: "Save name" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Your name (optional)"), { target: { value: "  Maya " } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved."));
    expect(fetchFn.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ name: "Maya" });
    expect(refresh).toHaveBeenCalled();
  });
});
