// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SecondLook } from "./second-look";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/denied/second-look", useRouter: () => ({ push: vi.fn(), replace }) }));

const ID = "00000000-0000-4000-8000-000000000001";

function server(status: number, body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("SecondLook", () => {
  it("marks the card approved and shows the outcome", async () => {
    const fetchFn = server(200, {});
    render(<SecondLook applicationId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "They approved it" }));
    expect(await screen.findByRole("heading", { level: 1, name: "The issuer approved your application" })).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe(`/api/v1/applications/${ID}`);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ status: "approved", creditLimitCents: null });
  });

  it("explains a 409: the same card is already on Home, so this one can’t change", async () => {
    server(409, { error: { code: "already_exists", message: "An active record for this card already exists." } });
    render(<SecondLook applicationId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "They approved it" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You already have this card on Home as applied or approved, so this one can’t change. Check Home for it.",
    );
    expect(screen.getByRole("heading", { level: 1, name: "How did the second look go?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "They approved it" }).hasAttribute("disabled")).toBe(false);
  });

  it("sends a signed-out student to sign in", async () => {
    server(401, { error: { code: "unauthorized", message: "Sign in to continue." } });
    render(<SecondLook applicationId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "They approved it" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
  });
});
