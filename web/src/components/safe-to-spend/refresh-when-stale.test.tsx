// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const client = vi.hoisted(() => ({ refreshBank: vi.fn() }));
vi.mock("@/lib/api-client/safe-to-spend", () => client);

import { RefreshWhenStale } from "./refresh-when-stale";

const HOURS_AGO = new Date(Date.now() - 3 * 3600_000).toISOString();

afterEach(() => {
  refresh.mockReset();
  client.refreshBank.mockReset();
});

describe("RefreshWhenStale", () => {
  it("leaves fresh numbers alone", () => {
    render(<RefreshWhenStale refreshedAt={new Date().toISOString()} />);
    expect(client.refreshBank).not.toHaveBeenCalled();
  });

  it("reads old numbers again and shows the new ones", async () => {
    client.refreshBank.mockResolvedValue({ kind: "ok", data: {} });
    render(<RefreshWhenStale refreshedAt={HOURS_AGO} />);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it.each(["reconnect_needed", "relink_needed"])("shows Home's notice instead of the old number when the bank answers %s", async (code) => {
    client.refreshBank.mockResolvedValue({ kind: "failed", code, message: "x" });
    render(<RefreshWhenStale refreshedAt={HOURS_AGO} />);
    // Home is read again; the server now has the link's new status.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("says so when it could not update, so an old number is not shown as current", async () => {
    client.refreshBank.mockResolvedValue({ kind: "failed", code: "bank_unavailable", message: "x" });
    render(<RefreshWhenStale refreshedAt={HOURS_AGO} />);
    expect(await screen.findByText(/Couldn’t update/)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
