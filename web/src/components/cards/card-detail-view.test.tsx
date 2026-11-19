// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Application, ApplicationDetail } from "@/lib/api/application";
import { SENSITIVE } from "@/lib/analytics";
import { findCard } from "@/lib/cards/catalog";
import { cardRewards } from "@/lib/cards/rewards";
import { ESTIMATE_DISCLAIMER } from "@/lib/copy/results";
import { estimateYearOne } from "@/lib/results/value";
import type { CardFit } from "@/lib/rules/fit-tier";

import { CardDetailView } from "./card-detail-view";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/cards", useRouter: () => router }));

function catalogCard(id: string) {
  const card = findCard(id);
  if (!card) throw new Error(`${id} is not in the catalog`);
  return card;
}

const DISCOVER = "discover-it-student-cash-back";
const N1 = "This issuer has no preapproval check, so applying is the only way to find out.";
const N2 = "This card has no credit check to apply.";
const ID = "00000000-0000-4000-8000-000000000001";

const TRACKED: Application = {
  id: ID,
  cardId: DISCOVER,
  cardName: "Discover it Student Cash Back",
  status: "approved",
  creditLimitCents: 50000,
  appliedAt: null,
  statusUpdatedAt: "2026-10-25T00:00:00Z",
};

const SET_UP: ApplicationDetail = {
  ...TRACKED,
  denialReason: null,
  denialReasonNote: null,
  autopayStatus: "on",
  autopayPaymentType: "statement_balance",
  spendLimitCents: 15000,
  statementClosingDay: 18,
  paymentDueDay: 12,
};

const NOTHING_SET: ApplicationDetail = {
  ...SET_UP,
  creditLimitCents: null,
  autopayStatus: "unknown",
  autopayPaymentType: null,
  spendLimitCents: null,
  statementClosingDay: null,
  paymentDueDay: null,
};

const LIKELY: CardFit = {
  cardId: DISCOVER,
  tier: "likely_fit",
  ruleIds: [],
  reasons: ["Made for students, like you.", "You meet what the issuer asks, so check preapproval first."],
  notes: [],
};

// The section titles in order, and which ones are open.
function sectionTitles() {
  return Array.from(document.querySelectorAll("[data-accordion-section] h2 button > span > span:first-child")).map(
    (title) => title.textContent,
  );
}

function openSections() {
  return screen.getAllByRole("button", { expanded: true }).map((button) => button.querySelector("span > span")?.textContent);
}

const section = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}`) });

function open(title: string) {
  const button = section(title);
  if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
  return within(screen.getByRole("region", { name: title }));
}

describe("CardDetailView, a card the student does not have (K2)", () => {
  it("opens with the fit row and Why it fits you, then the other sections, then preapproval and Apply", () => {
    const rewards = cardRewards(DISCOVER);
    const estimate = estimateYearOne(rewards, { categories: ["groceries"], band: "200_to_500" });
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn rewards={rewards} estimate={estimate} fit={LIKELY} />);
    expect(screen.getByRole("heading", { level: 1, name: "Discover it Student Cash Back" })).toBeTruthy();
    // The fit row: Likely fit and the year-one estimate, masked from session replay.
    const fitRow = screen.getByText("Likely fit").closest(`.${SENSITIVE}`);
    expect(fitRow?.textContent).toMatch(/^Fit: Likely fit\$\d+ year one, est\.$/);
    expect(sectionTitles()).toEqual(["Why it fits you", "What the issuer looks for", "Rewards", "Fees and rates"]);
    expect(openSections()).toEqual(["Why it fits you"]);
    expect(section("Why it fits you").textContent).toBe("Why it fits youMade for students, like you");
    const why = within(screen.getByRole("region", { name: "Why it fits you" }));
    expect(why.getByText("Made for students, like you.")).toBeTruthy();
    expect(why.getByText(/in your first year$/)).toBeTruthy();
    expect(section("Why it fits you").closest("section")?.className).toContain(SENSITIVE);
    expect(section("What the issuer looks for").textContent).toBe("What the issuer looks forFrom Discover’s own rules");
    expect(section("Rewards").textContent).toBe("Rewards5% in rotating categories, 1% on the rest");
    expect(section("Fees and rates").textContent).toBe("Fees and rates$0 annual fee · 0% foreign fee");
    // The buttons as Your match orders them, after every section.
    const buttons = screen.getAllByRole("button", { name: /: Discover it Student Cash Back$/ });
    expect(buttons.map((button) => button.textContent)).toEqual(["Check if you’re preapproved", "Apply at Discover"]);
    expect(section("Fees and rates").compareDocumentPosition(buttons[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No status, no Update status, and no card art on a match.
    expect(screen.queryByRole("region", { name: "Your status" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Update status" })).toBeNull();
    expect(document.querySelector('img[src*="discover-it-student-cash-back"]')).toBeNull();
  });

  it("keeps one section open at a time", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn rewards={cardRewards(DISCOVER)} fit={LIKELY} />);
    fireEvent.click(section("Rewards"));
    expect(openSections()).toEqual(["Rewards"]);
    fireEvent.click(section("Fees and rates"));
    expect(openSections()).toEqual(["Fees and rates"]);
  });

  it("shows a stretch as a stretch, with its caution first", () => {
    const stretch: CardFit = { ...LIKELY, tier: "stretch", ruleIds: ["C2"], reasons: ["You were turned down recently."] };
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn fit={stretch} />);
    expect(screen.getByText("Stretch")).toBeTruthy();
    expect(section("Why it fits you").textContent).toBe("Why it fits youApproval is less certain for you");
  });

  it("has no fit row or Why it fits you for a card that is not a fit yet, and opens the issuer's rules first", () => {
    const notYet: CardFit = { ...LIKELY, tier: "not_yet", ruleIds: ["G3"], reasons: ["This card is only for students."] };
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn rewards={cardRewards(DISCOVER)} fit={notYet} />);
    expect(screen.queryByText("Not yet")).toBeNull();
    expect(sectionTitles()).toEqual(["What the issuer looks for", "Rewards", "Fees and rates"]);
    expect(openSections()).toEqual(["What the issuer looks for"]);
  });

  it("shows a signed-out visitor the sections without a fit, and the buttons", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn={false} rewards={cardRewards(DISCOVER)} fit={LIKELY} />);
    expect(screen.queryByText("Likely fit")).toBeNull();
    expect(sectionTitles()).toEqual(["What the issuer looks for", "Rewards", "Fees and rates"]);
    expect(screen.getByRole("button", { name: "Check if you’re preapproved: Discover it Student Cash Back" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("lists every rule the issuer publishes under What the issuer looks for", () => {
    const card = catalogCard(DISCOVER);
    const rules = card.conditions.filter((condition) => condition.affects === "approval");
    expect(rules.length).toBeGreaterThan(1);
    render(<CardDetailView card={card} signedIn={false} />);
    const box = open("What the issuer looks for");
    expect(box.getAllByRole("listitem").map((item) => item.textContent)).toEqual(rules.map((rule) => rule.text));
  });

  it("shows only Apply, as the primary, and note N2 not N1, for a card with no credit check and no preapproval (Chime)", () => {
    const card = catalogCard("chime-card");
    expect(card.runsCreditCheck).toBe(false);
    expect(card.preapprovalUrl).toBeNull();
    render(<CardDetailView card={card} signedIn />);
    expect(screen.getAllByRole("button", { name: /: Chime/ }).map((button) => button.textContent)).toEqual(["Apply at Chime"]);
    const box = open("What the issuer looks for");
    expect(box.getByText(N2)).toBeTruthy();
    expect(box.queryByText(N1)).toBeNull();
  });

  it("shows note N1 for a card that runs a credit check and has no preapproval", () => {
    const card = catalogCard("apple-card");
    expect(card.runsCreditCheck).toBe(true);
    expect(card.preapprovalUrl).toBeNull();
    render(<CardDetailView card={card} signedIn />);
    expect(open("What the issuer looks for").getByText(N1)).toBeTruthy();
    expect(screen.queryByText(N2)).toBeNull();
  });

  it("shows neither note when the card has a preapproval check and a credit check", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn />);
    open("What the issuer looks for");
    expect(screen.queryByText(N1)).toBeNull();
    expect(screen.queryByText(N2)).toBeNull();
  });

  it("lists what the card earns and its sign-up bonus, in the issuer's words", () => {
    const rewards = cardRewards("capital-one-savor-students");
    if (!rewards?.bonus) throw new Error("expected rewards with a bonus");
    render(<CardDetailView card={catalogCard("capital-one-savor-students")} signedIn rewards={rewards} />);
    const box = open("Rewards");
    expect(box.getAllByRole("listitem")).toHaveLength(rewards.rates.length);
    for (const rate of rewards.rates) expect(box.getByText(rate.category)).toBeTruthy();
    expect(box.getByText(rewards.bonus.summary)).toBeTruthy();
    // No spending answer: no estimate.
    expect(box.queryByText(/in your first year/)).toBeNull();
  });

  it("adds the student's year-one estimate to Rewards, masked from session replay, when they answered spending", () => {
    const rewards = cardRewards("capital-one-savor-students");
    const estimate = estimateYearOne(rewards, { categories: ["groceries"], band: "200_to_500" });
    render(<CardDetailView card={catalogCard("capital-one-savor-students")} signedIn rewards={rewards} estimate={estimate} />);
    const box = open("Rewards");
    const line = box.getByText(/in your first year/);
    expect(line.textContent).toMatch(/^About \$\d+ in your first year$/);
    expect(line.closest(`.${SENSITIVE}`)).not.toBeNull();
    expect(box.getByText("From your groceries")).toBeTruthy();
    expect(box.getByText(ESTIMATE_DISCLAIMER)).toBeTruthy();
  });

  it("says plainly when a card earns no rewards", () => {
    render(<CardDetailView card={catalogCard("capital-one-platinum")} signedIn rewards={cardRewards("capital-one-platinum")} />);
    expect(section("Rewards").textContent).toBe("RewardsNo rewards on purchases");
    expect(open("Rewards").getByText("No rewards on purchases.")).toBeTruthy();
  });

  it("lists the fees, the deposit and what it is for a secured card", () => {
    const card = catalogCard("capital-one-platinum-secured");
    render(<CardDetailView card={card} signedIn />);
    const box = open("Fees and rates");
    expect(box.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Annual fee · $0",
      "Foreign fee · 0%",
      `Deposit · From $${card.depositMinCents / 100}`,
      "Credit check · Yes",
    ]);
    expect(box.getByText(/refundable deposit/i)).toBeTruthy();
  });

  it("keeps “Saved as applied” on screen when the save turns the page into the student's card (K1)", async () => {
    // Back from the issuer's site: the question is asked again (issuer-actions.tsx).
    sessionStorage.setItem(`cense:did-you-apply:${DISCOVER}`, "1");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({}, { status: 201 })));
    const card = catalogCard(DISCOVER);
    const { rerender } = render(<CardDetailView card={card} signedIn fit={LIKELY} />);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, I finished" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved as applied.");
    // The refresh after the save: the card is tracked now.
    rerender(<CardDetailView card={card} signedIn fit={LIKELY} tracked={{ ...TRACKED, status: "applied", creditLimitCents: null }} />);
    expect(screen.getByRole("region", { name: "Your status" }).textContent).toBe("APPLIED");
    expect(screen.getByRole("status").textContent).toContain("Saved as applied.");
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("goes back to the student's match when opened from the result screen", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn from="results" />);
    expect(screen.getByRole("link", { name: "Back to Your match" }).getAttribute("href")).toBe("/results");
  });

  it("goes back to the card list by default", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn />);
    expect(screen.getByRole("link", { name: "Back to Cards" }).getAttribute("href")).toBe("/cards");
  });
});

describe("CardDetailView, the student's own card (K1)", () => {
  it("shows an approved card's art, its decision and its sections, with Your dates open first", () => {
    render(
      <CardDetailView card={catalogCard(DISCOVER)} signedIn tracked={TRACKED} detail={SET_UP} reminders="on" rewards={cardRewards(DISCOVER)} />,
    );
    const status = screen.getByRole("region", { name: "Your status" });
    expect(status.textContent).toBe("Approved");
    expect(status.className).toContain(SENSITIVE);
    expect(status.querySelector('img[src*="discover-it-student-cash-back"]')).not.toBeNull();
    expect(sectionTitles()).toEqual(["Your dates", "Autopay and reminders", "Spend limit", "Rewards", "Fees and rates"]);
    expect(openSections()).toEqual(["Your dates"]);
    expect(section("Your dates").textContent).toBe("Your datesStatement closes day 18 · due day 12");
    expect(section("Autopay and reminders").textContent).toBe("Autopay and remindersAutopay on · reminders on");
    expect(section("Spend limit").textContent).toBe("Spend limit$150 a month, your pick");
    // The student's own card: no preapproval check or apply hand-off.
    expect(screen.queryByRole("button", { name: /Check if you’re preapproved/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Apply at/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Update status" }).getAttribute("href")).toBe(`/applications/${ID}?from=card`);
  });

  it("shows the saved days with the way to change them, keeping the page's own origin for Back and Save", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn tracked={TRACKED} detail={SET_UP} reminders="on" from="home" />);
    const dates = within(screen.getByRole("region", { name: "Your dates" }));
    expect(dates.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Statement closes · Day 18", "Payment due · Day 12"]);
    expect(dates.queryByText(/from your bank/)).toBeNull();
    expect(dates.getByRole("link", { name: "Change your dates" }).getAttribute("href")).toBe(
      `/applications/${ID}/reminders?from=card&card_from=home`,
    );
  });

  it("opens autopay, reminders and the spend limit from their sections", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn tracked={TRACKED} detail={SET_UP} reminders="off" />);
    const autopay = open("Autopay and reminders");
    expect(autopay.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Autopay · On, statement balance", "Reminders · Off"]);
    // Each opens with this page as its origin, so Back and Save return here.
    expect(autopay.getByRole("link", { name: "See autopay" }).getAttribute("href")).toBe(`/applications/${ID}/setup/autopay/on?from=card`);
    expect(autopay.getByRole("link", { name: "Change reminders" }).getAttribute("href")).toBe(`/applications/${ID}/reminders?from=card`);
    const limit = open("Spend limit");
    expect(limit.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Spend limit · $150 a month", "Credit limit · $500"]);
    // A credit limit is saved, so the limit opens at the suggestion (S2).
    expect(limit.getByRole("link", { name: "Change your limit" }).getAttribute("href")).toBe(
      `/applications/${ID}/setup/spend-limit/suggestion?from=card`,
    );
  });

  it("keeps the page's own origin on autopay and spend limit links, so their Back and Save return to it as it was opened", () => {
    const { unmount } = render(
      <CardDetailView card={catalogCard(DISCOVER)} signedIn tracked={TRACKED} detail={SET_UP} reminders="on" from="home" />,
    );
    expect(open("Autopay and reminders").getByRole("link", { name: "See autopay" }).getAttribute("href")).toBe(
      `/applications/${ID}/setup/autopay/on?from=card&card_from=home`,
    );
    expect(open("Spend limit").getByRole("link", { name: "Change your limit" }).getAttribute("href")).toBe(
      `/applications/${ID}/setup/spend-limit/suggestion?from=card&card_from=home`,
    );
    unmount();
    render(
      <CardDetailView
        card={catalogCard(DISCOVER)}
        signedIn
        tracked={{ ...TRACKED, creditLimitCents: null }}
        detail={NOTHING_SET}
        reminders="not_set"
        from="results"
      />,
    );
    expect(open("Autopay and reminders").getByRole("link", { name: "Turn on autopay" }).getAttribute("href")).toBe(
      `/applications/${ID}/setup/autopay?from=card&card_from=results`,
    );
    expect(open("Spend limit").getByRole("link", { name: "Set a spend limit" }).getAttribute("href")).toBe(
      `/applications/${ID}/setup/spend-limit?from=card&card_from=results`,
    );
  });

  it("says what is not set yet on an approved card with nothing saved, with the way to set each", () => {
    render(
      <CardDetailView
        card={catalogCard(DISCOVER)}
        signedIn
        tracked={{ ...TRACKED, creditLimitCents: null }}
        detail={NOTHING_SET}
        reminders="not_set"
      />,
    );
    expect(section("Your dates").textContent).toBe("Your datesNot set yet");
    expect(within(screen.getByRole("region", { name: "Your dates" })).getByRole("link", { name: "Add your dates" })).toBeTruthy();
    expect(section("Autopay and reminders").textContent).toBe("Autopay and remindersAutopay not set yet · reminders not set yet");
    const autopay = open("Autopay and reminders");
    expect(autopay.getByRole("link", { name: "Turn on autopay" }).getAttribute("href")).toBe(`/applications/${ID}/setup/autopay?from=card`);
    expect(autopay.getByRole("link", { name: "Choose your reminders" })).toBeTruthy();
    expect(section("Spend limit").textContent).toBe("Spend limitNot set yet");
    // No credit limit yet: the spend limit asks for it first (S1).
    expect(open("Spend limit").getByRole("link", { name: "Set a spend limit" }).getAttribute("href")).toBe(
      `/applications/${ID}/setup/spend-limit?from=card`,
    );
  });

  it("masks the student's dates, autopay and spend limit from session replay", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn tracked={TRACKED} detail={SET_UP} reminders="on" />);
    for (const title of ["Your dates", "Autopay and reminders", "Spend limit"]) {
      expect(section(title).closest("section")?.className, title).toContain(SENSITIVE);
    }
  });

  it("shows a secured card's deposit on Fees and rates without opening it", () => {
    render(<CardDetailView card={catalogCard("capital-one-platinum-secured")} signedIn={false} />);
    expect(section("Fees and rates").textContent).toBe("Fees and rates$0 annual fee · 0% foreign fee · $49 deposit");
  });

  it("shows an applied card's status pill and the issuer's rules, rewards and fees, not dates", () => {
    render(
      <CardDetailView
        card={catalogCard(DISCOVER)}
        signedIn
        tracked={{ ...TRACKED, status: "applied", creditLimitCents: null }}
        rewards={cardRewards(DISCOVER)}
      />,
    );
    expect(screen.getByRole("region", { name: "Your status" }).textContent).toBe("APPLIED");
    expect(sectionTitles()).toEqual(["What the issuer looks for", "Rewards", "Fees and rates"]);
    expect(screen.queryByRole("button", { name: /^Apply at/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Update status" }).getAttribute("href")).toBe(`/applications/${ID}?from=card`);
  });

  it("shows a denied card as Not approved, with Update status", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn tracked={{ ...TRACKED, status: "rejected", creditLimitCents: null }} />);
    expect(screen.getByRole("region", { name: "Your status" }).textContent).toBe("Not approved");
    expect(screen.getByRole("link", { name: "Update status" }).getAttribute("href")).toBe(`/applications/${ID}?from=card`);
  });

  it("shows a signed-out visitor the match page, never someone's status", () => {
    render(<CardDetailView card={catalogCard(DISCOVER)} signedIn={false} tracked={TRACKED} detail={SET_UP} reminders="on" />);
    expect(screen.queryByRole("region", { name: "Your status" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Update status" })).toBeNull();
    expect(screen.queryByText("Your dates")).toBeNull();
  });

  it("shows the plain card when the issuer has no clean art", () => {
    render(
      <CardDetailView
        card={catalogCard("chime-card")}
        signedIn
        tracked={{ ...TRACKED, cardId: "chime-card", status: "applied" }}
        rewards={cardRewards("chime-card")}
      />,
    );
    expect(within(screen.getByRole("region", { name: "Your status" })).getByTestId("card-art-fallback")).toBeTruthy();
  });
});
