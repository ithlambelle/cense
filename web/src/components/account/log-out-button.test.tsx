// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LogOutButton } from "./log-out-button";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  replace.mockClear();
});

describe("LogOutButton", () => {
  it("forgets this tab’s Cense notes, keeps anything else, and goes to Welcome", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({ status: "signed_out" })));
    sessionStorage.setItem("cense:pending-apply", "sample-card");
    sessionStorage.setItem("cense:mock:plan", "{}");
    sessionStorage.setItem("other-site", "kept");
    render(<LogOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(sessionStorage.getItem("cense:pending-apply")).toBeNull();
    expect(sessionStorage.getItem("cense:mock:plan")).toBeNull();
    expect(sessionStorage.getItem("other-site")).toBe("kept");
  });

  it("keeps the notes and stays put when logging out fails", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("crash", { status: 500 })));
    sessionStorage.setItem("cense:pending-apply", "sample-card");
    render(<LogOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(sessionStorage.getItem("cense:pending-apply")).toBe("sample-card");
    expect(replace).not.toHaveBeenCalled();
  });
});
