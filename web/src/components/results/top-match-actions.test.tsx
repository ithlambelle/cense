// @vitest-environment jsdom
// Created with Claude Code (2026-11-18). The top match's buttons on Your match
// (M1, Figma 821:9205). Each tap must save and copy the click exactly as the
// card page's IssuerActions does (issuer-actions.test.tsx).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HAND_OFF_LINE, PREAPPROVAL_LINE } from "@/lib/copy/issuer";

import { TopMatchActions } from "./top-match-actions";

const push = vi.fn();
const refresh = vi.fn();
const router = { push, replace: vi.fn(), refresh };
vi.mock("next/navigation", () => ({ usePathname: () => "/results", useRouter: () => router }));
// Records each event, and still runs the real track(), which throws on an
// event that does not match the catalog.
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return {
    ...actual,
    track: (...args: Parameters<typeof actual.track>) => {
      track(...args);
      actual.track(...args);
    },
  };
});

const CLICK_ID = "00000000-0000-4000-8000-0000000000c1";
// A made-up card. Not a real product and not from the catalog.
const card = { id: "sample-card", brand: "Sample Bank", name: "Sample Bank Card", referralDisclosure: null };
// Both buttons go straight to the issuer in a new tab, and their names say so.
const PREAPPROVAL = "Check if you’re preapproved: Sample Bank Card, opens in a new tab";
const APPLY = "Apply at Sample Bank: Sample Bank Card, opens in a new tab";
const DETAILS = "/cards/sample-card?from=results";

type FakeTab = { opener: unknown; closed: boolean; close: ReturnType<typeof vi.fn>; location: { replace: ReturnType<typeof vi.fn> } };

function fakeTab(): FakeTab {
  return { opener: window, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
}

function answer(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

function click(kind: "preapproval" | "apply", url: string) {
  return { id: CLICK_ID, cardId: card.id, kind, url, clickedAt: "2026-11-18T00:00:00Z" };
}

function renderActions(props: Partial<Parameters<typeof TopMatchActions>[0]> = {}) {
  return render(<TopMatchActions card={card} hasPreapproval tracked={false} detailsHref={DETAILS} {...props} />);
}

let tab: FakeTab;
let open: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  push.mockClear();
  refresh.mockClear();
  track.mockClear();
  tab = fakeTab();
  open = vi.fn(() => tab);
  vi.stubGlobal("open", open);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TopMatchActions", () => {
  it("leads with the preapproval check as the primary button, then Apply at the issuer as the secondary", () => {
    renderActions();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Check if you’re preapproved", "Apply at Sample Bank"]);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([PREAPPROVAL, APPLY]);
    // Primary (371:2817): filled, label left, with the chevron. Secondary (371:2821): white, Amethyst border and label.
    expect(buttons[0].className).toContain("bg-violet");
    expect(buttons[0].className).toContain("justify-between");
    expect(buttons[0].querySelector("svg")).not.toBeNull();
    expect(buttons[1].className).toContain("border-violet");
    expect(buttons[1].className).toContain("bg-white");
    expect(buttons[1].className).toContain("text-violet");
    expect(buttons[1].className).not.toContain("text-navy");
    expect(buttons[1].querySelector("svg")).toBeNull();
    expect(screen.queryByRole("link", { name: /See details/ })).toBeNull();
  });

  it("says the check won't affect a credit score under it, and the hand-off line under Apply, as the card page does", () => {
    renderActions();
    const preapprovalLine = screen.getByText(PREAPPROVAL_LINE);
    const handOffLine = screen.getByText(HAND_OFF_LINE);
    const [preapproval, apply] = screen.getAllByRole("button");
    // DOM order: preapproval, its line, Apply, the hand-off line.
    expect(preapproval.compareDocumentPosition(preapprovalLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preapprovalLine.compareDocumentPosition(apply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(apply.compareDocumentPosition(handOffLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preapprovalLine.className).toContain("text-center");
  });

  it("keeps the hand-off line but not the credit score line when there is no preapproval check", () => {
    renderActions({ hasPreapproval: false });
    expect(screen.queryByText(PREAPPROVAL_LINE)).toBeNull();
    expect(screen.getByText(HAND_OFF_LINE)).toBeTruthy();
  });

  it("shows the card's referral disclosure above Apply, and nothing when it has none", () => {
    const disclosure = "Cense may be paid if you are approved for this card.";
    const { unmount } = renderActions({ card: { ...card, referralDisclosure: disclosure } });
    const line = screen.getByText(disclosure);
    const apply = screen.getByRole("button", { name: APPLY });
    expect(line.compareDocumentPosition(apply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(PREAPPROVAL_LINE).compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    renderActions();
    expect(screen.queryByText(disclosure)).toBeNull();
    expect(screen.getAllByText(/./, { selector: "p" }).map((p) => p.textContent)).toEqual([PREAPPROVAL_LINE, HAND_OFF_LINE]);
  });

  it("sits 10px under the fee chips, as drawn, where the card's gap is 16px", () => {
    const { container } = renderActions();
    expect((container.firstElementChild as HTMLElement).className.split(/\s+/)).toEqual(
      expect.arrayContaining(["-mt-1.5", "gap-2.5"]),
    );
  });

  it("shows Apply alone, as the primary, for a card with no preapproval check", () => {
    renderActions({ hasPreapproval: false });
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([APPLY]);
    expect(buttons[0].className).toContain("bg-violet");
    expect(buttons[0].querySelector("svg")).not.toBeNull();
  });

  it("checks preapproval in one tap: saves the click, copies it, opens the issuer in a cut-off tab, asks nothing", async () => {
    const fetchFn = answer(201, click("preapproval", "https://issuer.example/preapproval"));
    vi.stubGlobal("fetch", fetchFn);
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: PREAPPROVAL }));

    // Opened during the tap, before the request, and cut off from this page.
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith("https://issuer.example/preapproval"));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/issuer-clicks");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ cardId: "sample-card", kind: "preapproval" });
    expect(track).toHaveBeenCalledExactlyOnceWith(
      "issuer_link_clicked",
      { click_id: CLICK_ID, card_id: "sample-card", link_type: "preapproval", source: "results" },
      { uuid: CLICK_ID, timestamp: new Date("2026-11-18T00:00:00Z") },
    );
    expect(screen.queryByText("Did you finish applying?")).toBeNull();
    expect(sessionStorage.getItem("cense:did-you-apply:sample-card")).toBeNull();
    expect(screen.getByRole("button", { name: APPLY })).toBeTruthy();
  });

  it("applies in one tap, then asks if they finished, remembered in this tab for the card page too", async () => {
    const fetchFn = answer(201, click("apply", "https://issuer.example/apply"));
    vi.stubGlobal("fetch", fetchFn);
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: APPLY }));

    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith("https://issuer.example/apply"));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ cardId: "sample-card", kind: "apply" });
    expect(track).toHaveBeenCalledExactlyOnceWith(
      "issuer_link_clicked",
      { click_id: CLICK_ID, card_id: "sample-card", link_type: "apply", source: "results" },
      { uuid: CLICK_ID, timestamp: new Date("2026-11-18T00:00:00Z") },
    );
    expect(await screen.findByRole("heading", { name: "Did you finish applying?" })).toBeTruthy();
    // The card page's key: whichever page answers clears it for both.
    expect(sessionStorage.getItem("cense:did-you-apply:sample-card")).toBe("1");
  });

  it("apply works the same with no preapproval check", async () => {
    const fetchFn = answer(201, click("apply", "https://issuer.example/apply"));
    vi.stubGlobal("fetch", fetchFn);
    renderActions({ hasPreapproval: false });
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith("https://issuer.example/apply"));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ cardId: "sample-card", kind: "apply" });
    expect(await screen.findByText("Did you finish applying?")).toBeTruthy();
  });

  it("still opens the issuer when the click could not be recorded, with no analytics copy", async () => {
    vi.stubGlobal("fetch", answer(200, { ...click("apply", "https://issuer.example/apply"), id: null, clickedAt: null }));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith("https://issuer.example/apply"));
    expect(track).not.toHaveBeenCalledWith("issuer_link_clicked", expect.anything(), expect.anything());
  });

  it("saves Applied on Yes and refreshes, then says it is on Home", async () => {
    const fetchFn = answer(201, click("apply", "https://issuer.example/apply"));
    vi.stubGlobal("fetch", fetchFn);
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, I finished" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved as applied.");
    expect(fetchFn.mock.calls[1][0]).toBe("/api/v1/applications");
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({
      cardId: "sample-card",
      cardName: "Sample Bank Card",
      status: "applied",
      creditLimitCents: null,
    });
    expect(track).toHaveBeenLastCalledWith("outcome_reported", { outcome: "applied", source: "did_you_apply" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("cense:did-you-apply:sample-card")).toBeNull();
    expect(screen.getByRole("link", { name: "Go to Home" }).getAttribute("href")).toBe("/home");
  });

  it("brings the buttons back on Not yet, saving nothing", async () => {
    const fetchFn = answer(201, click("apply", "https://issuer.example/apply"));
    vi.stubGlobal("fetch", fetchFn);
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    fireEvent.click(await screen.findByRole("button", { name: "Not yet" }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenLastCalledWith("outcome_reported", { outcome: "didnt_apply", source: "did_you_apply" });
    expect(sessionStorage.getItem("cense:did-you-apply:sample-card")).toBeNull();
    expect(screen.getByRole("button", { name: PREAPPROVAL })).toBeTruthy();
  });

  it("asks again after a reload if the student left to apply", async () => {
    sessionStorage.setItem("cense:did-you-apply:sample-card", "1");
    renderActions();
    expect(await screen.findByText("Did you finish applying?")).toBeTruthy();
  });

  it("offers a safe link to tap when the browser blocks the new tab", async () => {
    open.mockReturnValue(null);
    vi.stubGlobal("fetch", answer(201, click("apply", "https://issuer.example/apply")));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    const link = await screen.findByRole("link", { name: "The new tab didn’t open. Open Sample Bank’s site." });
    expect(link.getAttribute("href")).toBe("https://issuer.example/apply");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.click(link);
    expect(screen.getByText("Did you finish applying?")).toBeTruthy();
  });

  it("refuses an address that is not https and closes the tab", async () => {
    vi.stubGlobal("fetch", answer(201, click("preapproval", "javascript:alert(1)")));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: PREAPPROVAL }));
    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("couldn’t open");
  });

  it("closes the tab and shows the API's message when the click cannot be saved", async () => {
    vi.stubGlobal("fetch", answer(503, { error: { code: "catalog_unavailable", message: "The card catalog is not ready yet." } }));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: PREAPPROVAL }));
    expect((await screen.findByRole("alert")).textContent).toBe("The card catalog is not ready yet.");
    expect(tab.close).toHaveBeenCalled();
  });

  it("sends a student whose session ran out to sign in, coming back to Your match", async () => {
    vi.stubGlobal("fetch", answer(401, { error: { code: "unauthorized", message: "Sign in to continue." } }));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in?next=%2Fresults"));
    expect(tab.close).toHaveBeenCalled();
  });

  it("blocks the other button while one is opening, so only one tab opens", async () => {
    let finish: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => (finish = resolve))));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: PREAPPROVAL }));
    expect(screen.getByRole("button", { name: APPLY }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    expect(open).toHaveBeenCalledOnce();
    finish(Response.json(click("preapproval", "https://issuer.example/preapproval"), { status: 201 }));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalled());
  });

  it("opens one tab and saves one click when the same button is tapped twice", async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal("fetch", fetchFn);
    renderActions();
    const preapproval = screen.getByRole("button", { name: PREAPPROVAL });
    fireEvent.click(preapproval);
    fireEvent.click(preapproval);
    expect(open).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledOnce();
    finish(Response.json(click("preapproval", "https://issuer.example/preapproval"), { status: 201 }));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledOnce());
    expect(track).toHaveBeenCalledOnce();
  });

  it("does the same for a double tap on Apply", async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal("fetch", fetchFn);
    renderActions();
    const apply = screen.getByRole("button", { name: APPLY });
    fireEvent.click(apply);
    fireEvent.click(apply);
    expect(open).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledOnce();
    finish(Response.json(click("apply", "https://issuer.example/apply"), { status: 201 }));
    expect(await screen.findByRole("heading", { name: "Did you finish applying?" })).toBeTruthy();
    expect(tab.location.replace).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledOnce();
  });

  it("shows See details instead of the buttons for a card the student already tracks", () => {
    renderActions({ tracked: true });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const details = screen.getByRole("link", { name: "See details: Sample Bank Card" });
    expect(details.getAttribute("href")).toBe(DETAILS);
    expect(details.textContent).toBe("See details");
  });
});
