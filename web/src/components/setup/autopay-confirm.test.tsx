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
