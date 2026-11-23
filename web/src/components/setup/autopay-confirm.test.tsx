// @vitest-environment jsdom
// Created with Claude Code (2026-11-08). I3, "Did you turn on autopay?" (US-10).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutopayConfirm } from "./autopay-confirm";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => router }));

const ID = "00000000-0000-4000-8000-000000000001";

function server(reply: { status: number; body: unknown }) {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(reply.body, { status: reply.status }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  router.push.mockClear();
  router.replace.mockClear();
});

describe("AutopayConfirm", () => {
  it("opened from the card's page: Back keeps that origin, Not yet returns to the page and a yes opens Autopay is on from it", async () => {
    const CARD = "discover-it-student-cash-back";
    const props = { applicationId: ID, issuerName: "Discover", from: "card", cardId: CARD, cardFrom: "home" } as const;
    server({ status: 200, body: {} });
    const { unmount } = render(<AutopayConfirm {...props} />);
    expect(screen.getByRole("link", { name: "Back to Autopay steps" }).getAttribute("href")).toBe(
      `/applications/${ID}/setup/autopay?from=card&card_from=home`,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Not yet" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/cards/${CARD}?from=home`));
    unmount();
    router.push.mockClear();
    render(<AutopayConfirm {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Yes, the full statement balance" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/applications/${ID}/setup/autopay/on?from=card&card_from=home`));
  });

  it("opened from the setup list: Not yet goes back to it", async () => {
    server({ status: 200, body: {} });
    render(<AutopayConfirm applicationId={ID} issuerName="Discover" />);
    expect(screen.getByRole("link", { name: "Back to Autopay steps" }).getAttribute("href")).toBe(`/applications/${ID}/setup/autopay`);
    fireEvent.click(screen.getByRole("radio", { name: "Not yet" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/applications/${ID}/setup`));
  });

  it("returns to this question after signing in when the session ended", async () => {
    server({ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } });
    render(<AutopayConfirm applicationId={ID} issuerName="Discover" />);
    fireEvent.click(screen.getByRole("radio", { name: "Yes, the full statement balance" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent(`/applications/${ID}/setup/autopay/confirm`)}`),
    );
  });
});
