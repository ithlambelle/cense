// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";
import { limitToCents } from "@/lib/credit-limit";

import { MarkResult } from "./mark-result";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => ({ push, replace, refresh: vi.fn() }) }));

const ID = "00000000-0000-4000-8000-000000000001";
const application: Application = {
  id: ID,
  cardId: "sample",
  cardName: "Sample Bank Card",
  status: "applied",
  creditLimitCents: null,
  appliedAt: null,
  statusUpdatedAt: "2026-10-16T00:00:00Z",
};

function server(status: number, body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const sent = (fetchFn: ReturnType<typeof server>) => JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
const saved = { ...application, statusUpdatedAt: "2026-10-16T01:00:00Z" };

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  replace.mockClear();
});

describe("limitToCents", () => {
  it("reads dollars with or without $, commas and cents", () => {
    expect(limitToCents("")).toBeNull();
    expect(limitToCents("500")).toBe(50000);
    expect(limitToCents("$1,500")).toBe(150000);
    expect(limitToCents("500.00")).toBe(50000);
    expect(limitToCents("$ 750.5")).toBe(75050);
  });

  it("refuses words, bad comma grouping, a zero limit and impossible amounts", () => {
    expect(limitToCents("five hundred")).toBeUndefined();
    expect(limitToCents("$1,5,0,0")).toBeUndefined();
    expect(limitToCents("0")).toBeUndefined();
    expect(limitToCents("500.255")).toBeUndefined();
    expect(limitToCents("1000001")).toBeUndefined();
  });
});

describe("MarkResult", () => {
  it("saves a denial with no limit and opens the denial guide for this card", async () => {
    const fetchFn = server(200, { ...saved, status: "rejected" });
    render(<MarkResult application={application} />);
    fireEvent.click(screen.getByRole("button", { name: "I was denied" }));
    expect(fetchFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, mark as denied" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/denied?application=${ID}`));
    expect(fetchFn.mock.calls[0][0]).toBe(`/api/v1/applications/${ID}`);
    expect(sent(fetchFn)).toEqual({ status: "rejected", creditLimitCents: null });
  });

  it("saves an approval with the limit in cents, then goes Home", async () => {
    const fetchFn = server(200, { ...saved, status: "approved", creditLimitCents: 50000 });
    render(<MarkResult application={application} />);
    fireEvent.click(screen.getByRole("button", { name: "I was approved" }));
    fireEvent.change(screen.getByLabelText("Credit limit (optional)"), { target: { value: "$500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
    expect(sent(fetchFn)).toEqual({ status: "approved", creditLimitCents: 50000 });
  });

  it("keeps the saved limit when an approved card is marked again", async () => {
    const fetchFn = server(200, { ...saved, status: "approved", creditLimitCents: 50000 });
    render(<MarkResult application={{ ...application, status: "approved", creditLimitCents: 50000 }} />);
    fireEvent.click(screen.getByRole("button", { name: "I was approved" }));
    expect((screen.getByLabelText("Credit limit (optional)") as HTMLInputElement).value).toBe("500");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
    expect(sent(fetchFn)).toEqual({ status: "approved", creditLimitCents: 50000 });
  });

  it("asks for dollars instead of saving a limit it cannot read", () => {
    const fetchFn = server(200, saved);
    render(<MarkResult application={application} />);
    fireEvent.click(screen.getByRole("button", { name: "I was approved" }));
    fireEvent.change(screen.getByLabelText("Credit limit (optional)"), { target: { value: "five hundred" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain("like 500");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("saves nothing for not heard yet and explains the wait", () => {
    const fetchFn = server(200, saved);
    render(<MarkResult application={application} />);
    fireEvent.click(screen.getByRole("button", { name: "I haven’t heard yet" }));
    expect(push).toHaveBeenCalledWith(`/applications/${ID}/waiting`);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not move a student who left while the update was saving", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const { unmount } = render(<MarkResult application={application} />);
    fireEvent.click(screen.getByRole("button", { name: "I was denied" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, mark as denied" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    unmount();
    release(Response.json({ ...saved, status: "rejected" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("stays on the screen with the API's reason when a save fails", async () => {
    server(409, { error: { code: "already_exists", message: "An active record for this card already exists." } });
    render(<MarkResult application={application} />);
    fireEvent.click(screen.getByRole("button", { name: "I was denied" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, mark as denied" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already exists");
    expect(push).not.toHaveBeenCalled();
  });
});
