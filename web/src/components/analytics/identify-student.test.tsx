// @vitest-environment jsdom
// Created with Claude Code (2026-11-21).
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const analytics = vi.hoisted(() => ({ identify: vi.fn(), browserAsksNotToTrack: vi.fn(() => false) }));
vi.mock("@/lib/analytics", () => analytics);

const client = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/api-client/client", () => client);

import { IdentifyStudent } from "./identify-student";

afterEach(() => {
  refresh.mockReset();
  analytics.identify.mockReset();
  analytics.browserAsksNotToTrack.mockReset();
  analytics.browserAsksNotToTrack.mockReturnValue(false);
  client.apiRequest.mockReset();
});

describe("IdentifyStudent", () => {
  it("links the browser to the student and saves nothing without a browser signal", () => {
    render(<IdentifyStudent studentId="s1" isInternal={false} analyticsOn={true} />);
    expect(analytics.identify).toHaveBeenCalledWith("s1", false, true);
    expect(client.apiRequest).not.toHaveBeenCalled();
  });

  it("saves the opt-out to the account when the browser sends Global Privacy Control, so server events stop too", async () => {
    analytics.browserAsksNotToTrack.mockReturnValue(true);
    client.apiRequest.mockResolvedValue({ ok: true, data: { analyticsOn: false } });
    render(<IdentifyStudent studentId="s1" isInternal={false} analyticsOn={true} />);
    expect(client.apiRequest).toHaveBeenCalledWith("patch", "/me/privacy", { body: { analyticsOn: false } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("does nothing more when the switch is already off, or could not be read", () => {
    analytics.browserAsksNotToTrack.mockReturnValue(true);
    render(<IdentifyStudent studentId="s1" isInternal={false} analyticsOn={false} />);
    render(<IdentifyStudent studentId="s1" isInternal={false} analyticsOn={null} />);
    expect(client.apiRequest).not.toHaveBeenCalled();
  });

  it("keeps the page as it is when the save fails", async () => {
    analytics.browserAsksNotToTrack.mockReturnValue(true);
    client.apiRequest.mockResolvedValue({ ok: false, error: { code: "server_error", message: "x" } });
    render(<IdentifyStudent studentId="s1" isInternal={false} analyticsOn={true} />);
    await waitFor(() => expect(client.apiRequest).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });
});
