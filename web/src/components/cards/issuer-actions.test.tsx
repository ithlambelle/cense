// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssuerActions } from "./issuer-actions";

const push = vi.fn();
const router = { push, replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => router }));

const APPLY = "Apply on Sample Bank’s site: Sample Bank Card";
const PREAPPROVAL = "Check if you’re preapproved: Sample Bank Card";

// Opens the sheet, then taps its confirm button (where the new tab is opened).
async function through(trigger: string, confirm: string) {
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  fireEvent.click(await screen.findByRole("button", { name: confirm }));
}
const openApply = () => through(APPLY, "Open Sample Bank application");
const openPreapproval = () => through(PREAPPROVAL, "Go to preapproval check");

// A made-up card. Not a real product and not from the catalog.
const evidence = { basis: "issuer" as const, sourceUrls: ["https://issuer.example/card"], verifiedAt: "2026-10-15" };
const card = {
  id: "sample-card",
  brand: "Sample Bank",
  issuingBank: "Sample Bank, N.A.",
  name: "Sample Bank Card",
  catalogRole: "recommend" as const,
  catalogRoleReason: "Built for students.",
  annualFeeCents: 0,
  foreignTransactionFeePercent: 0,
  preapprovalUrl: "https://issuer.example/preapproval",
  applyUrl: "https://issuer.example/apply",
  referralDisclosure: null,
  historyNeeded: "none" as const,
  minHistoryMonths: null,
  studentsOnly: true,
  secured: false,
  depositMinCents: 0,
  depositMaxCents: null,
  okForRebuilding: false,
  runsCreditCheck: true,
  openToNewApplicants: true,
  conditions: [],
  eligibilityEvidence: Object.fromEntries(
    ["annualFeeCents", "historyNeeded", "minHistoryMonths", "studentsOnly", "secured", "depositMinCents", "depositMaxCents",
      "okForRebuilding", "preapprovalUrl", "runsCreditCheck", "openToNewApplicants", "foreignTransactionFeePercent", "issuingBank"]
      .map((field) => [field, evidence]),
  ) as never,
};

type FakeTab = { opener: unknown; closed: boolean; close: ReturnType<typeof vi.fn>; location: { replace: ReturnType<typeof vi.fn> } };

function fakeTab(): FakeTab {
  return { opener: window, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
}

function answer(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

function click(url: string) {
  return { id: "1", cardId: card.id, kind: "apply", url, clickedAt: "2026-10-11T00:00:00Z" };
}

let tab: FakeTab;
let open: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  push.mockClear();
  tab = fakeTab();
  open = vi.fn(() => tab);
  vi.stubGlobal("open", open);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IssuerActions", () => {
  it("shows preapproval first, with the line about the credit score", () => {
    render(<IssuerActions signedIn notes={[]} card={card} />);
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Check if you’re preapproved", "Apply on Sample Bank’s site"]);
    expect(screen.getByText("This check won’t affect your credit score.")).toBeTruthy();
    expect(screen.getByText(/doesn’t submit applications/)).toBeTruthy();
  });

  it("shows only apply, with the notes it is given, when there is no preapproval check", () => {
    render(<IssuerActions signedIn notes={["A note from the rules."]} card={{ ...card, preapprovalUrl: null }} />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Apply on Sample Bank’s site"]);
    expect(screen.getByText("A note from the rules.")).toBeTruthy();
    expect(screen.queryByText(/no preapproval check/)).toBeNull();
  });

  it("shows the referral disclosure in the apply sheet, before the student leaves", async () => {
    render(<IssuerActions signedIn notes={[]} card={{ ...card, referralDisclosure: "Cense may be paid if you apply." }} />);
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    expect(await screen.findByText("Cense may be paid if you apply.")).toBeTruthy();
  });

  it("saves the click, then sends the new tab to the address the API returned", async () => {
    const fetchFn = answer(201, click("https://issuer.example/apply"));
    vi.stubGlobal("fetch", fetchFn);
    render(<IssuerActions signedIn notes={[]} card={card} />);
    await openApply();

    // The tab is opened during the confirm tap, before the request, and cut off from this page.
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith("https://issuer.example/apply"));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ cardId: "sample-card", kind: "apply" });
    expect(await screen.findByText("Did you finish applying?")).toBeTruthy();
  });

  it("does not ask about applying after a preapproval check", async () => {
    vi.stubGlobal("fetch", answer(201, click("https://issuer.example/preapproval")));
    render(<IssuerActions signedIn notes={[]} card={card} />);
    await openPreapproval();
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalled());
    expect(screen.queryByText("Did you finish applying?")).toBeNull();
  });

  it("refuses an address that is not https and closes the tab", async () => {
    vi.stubGlobal("fetch", answer(201, click("javascript:alert(1)")));
    render(<IssuerActions signedIn notes={[]} card={card} />);
    await openApply();
    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("couldn’t open");
  });

  it("closes the tab and sends a signed-out visitor to sign in, with a way back to the card", async () => {
    vi.stubGlobal("fetch", answer(401, { error: { code: "unauthorized", message: "Sign in to continue." } }));
    render(<IssuerActions signedIn notes={[]} card={card} />);
    await openApply();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in?next=%2Fcards%2Fsample-card"));
    expect(tab.close).toHaveBeenCalled();
  });

  it("closes the tab and shows the API's message when the click cannot be saved", async () => {
    vi.stubGlobal("fetch", answer(503, { error: { code: "catalog_unavailable", message: "The card catalog is not ready yet." } }));
    render(<IssuerActions signedIn notes={[]} card={card} />);
    await openApply();
    expect((await screen.findByRole("alert")).textContent).toBe("The card catalog is not ready yet.");
    expect(tab.close).toHaveBeenCalled();
  });

  it("offers a link to tap when the browser blocks the new tab", async () => {
    open.mockReturnValue(null);
    vi.stubGlobal("fetch", answer(201, click("https://issuer.example/apply")));
    render(<IssuerActions signedIn notes={[]} card={card} />);
    await openApply();
    const link = await screen.findByRole("link", { name: /new tab didn’t open/ });
    expect(link.getAttribute("href")).toBe("https://issuer.example/apply");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.click(link);
    expect(screen.getByText("Did you finish applying?")).toBeTruthy();
  });

  it("sends a visitor known to be signed out straight to sign in, opening no tab", () => {
    const fetchFn = answer(201, click("https://issuer.example/apply"));
    vi.stubGlobal("fetch", fetchFn);
    render(<IssuerActions card={card} notes={[]} signedIn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply on Sample Bank’s site: Sample Bank Card" }));
    expect(push).toHaveBeenCalledWith("/sign-in?next=%2Fcards%2Fsample-card");
    expect(open).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("offers the link when the student closed the tab before the click was saved", async () => {
    tab.closed = true;
    vi.stubGlobal("fetch", answer(201, click("https://issuer.example/apply")));
    render(<IssuerActions signedIn notes={[]} card={card} />);
    await openApply();
    expect(await screen.findByRole("link", { name: /new tab didn’t open/ })).toBeTruthy();
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Did you finish applying?")).toBeNull();
  });

  it("clears an old error when the student answers Not yet", async () => {
    const fetchFn = answer(201, click("https://issuer.example/apply"));
    await reachQuestion(fetchFn);
    fetchFn.mockImplementation(async () => new Response("crash", { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, I finished" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  async function reachQuestion(fetchFn: ReturnType<typeof answer>) {
    vi.stubGlobal("fetch", fetchFn);
    render(<IssuerActions signedIn notes={[]} card={card} />);
    await openApply();
    await screen.findByText("Did you finish applying?");
  }

  it("creates an Applied record on Yes", async () => {
    const fetchFn = answer(201, click("https://issuer.example/apply"));
    await reachQuestion(fetchFn);
    fireEvent.click(screen.getByRole("button", { name: "Yes, I finished" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(fetchFn.mock.calls[1][0]).toBe("/api/v1/applications");
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({
      cardId: "sample-card",
      cardName: "Sample Bank Card",
      status: "applied",
      creditLimitCents: null,
    });
  });

  it("says a card that is already tracked is on Home, without claiming a new save", async () => {
    const fetchFn = answer(201, click("https://issuer.example/apply"));
    await reachQuestion(fetchFn);
    fetchFn.mockImplementation(async () =>
      Response.json({ error: { code: "already_exists", message: "An active record for this card already exists." } }, { status: 409 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes, I finished" }));
    expect((await screen.findByRole("status")).textContent).toContain("already on Home");
  });

  it("saves nothing and brings the buttons back on Not yet", async () => {
    const fetchFn = answer(201, click("https://issuer.example/apply"));
    await reachQuestion(fetchFn);
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Apply on Sample Bank’s site: Sample Bank Card" })).toBeTruthy();
  });

  it("opens no tab until the student confirms in the sheet, and closes the sheet on Not ready yet", async () => {
    render(<IssuerActions signedIn notes={[]} card={card} />);
    fireEvent.click(screen.getByRole("button", { name: APPLY }));
    expect(await screen.findByRole("dialog", { name: "Apply on the issuer’s site" })).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Not ready yet" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(open).not.toHaveBeenCalled();
  });

  it("asks again after a reload if the student left to apply", async () => {
    sessionStorage.setItem("cense:did-you-apply:sample-card", "1");
    render(<IssuerActions signedIn notes={[]} card={card} />);
    expect(await screen.findByText("Did you finish applying?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(sessionStorage.getItem("cense:did-you-apply:sample-card")).toBeNull();
  });
});
