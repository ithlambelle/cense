// Created with Claude Code (2026-11-26). Home's next step: each shipped
// priority rule's trigger, the order between them, and the edges the persona
// walk and the Demo Day flow reach (no bank, bank not read, thin history, no
// goal, goal accepted, a card without autopay, two cards, a denial, no card
// fits).
import { describe, expect, it } from "vitest";

import type { Application } from "@/lib/api/application";
import type { Budget } from "@/lib/api/budget";
import type { Goal } from "@/lib/api/goals";
import type { SafeToSpend } from "@/lib/api/safe-to-spend";

import { emergencyTargetCents, nextStep, nextStepInputs, NEXT_STEP_IDS, type NextStepInputs } from "./next-step";

type Bank = NonNullable<NextStepInputs["bank"]>;

// A student past every rule: bank read and checked, money in above money out,
// $1,500 in savings over a $1,000 cushion, a card on the bank, no tracked cards.
const BANK: Bank = {
  answered: true,
  budgetChecked: true,
  lastMonth: { incomeCents: 180_000, spentCents: 150_000 },
  essentialsCents: 92_500,
  savingsCents: 150_000,
  hasCardAccount: true,
};
const DONE: NextStepInputs = { bank: BANK, approvedCards: [], cardTracked: false, quiz: "unfinished", goal: null };
const with_ = (bank: Partial<Bank>, rest: Partial<NextStepInputs> = {}): NextStepInputs => ({ ...DONE, ...rest, bank: { ...BANK, ...bank } });

const CARD_A = "00000000-0000-4000-8000-00000000000a";
const CARD_B = "00000000-0000-4000-8000-00000000000b";

describe("nextStep: each rule's trigger", () => {
  it.each<[string, NextStepInputs, string, string, string]>([
    ["1 no bank linked", { ...DONE, bank: null }, "link_bank", "Link your bank", "/safe-to-spend/connect"],
    ["2 the bank is linked but not read yet", with_({ answered: false, budgetChecked: false, lastMonth: null }), "check_budget", "Read my bank", "/safe-to-spend/reading"],
    ["2 read but not confirmed", with_({ budgetChecked: false }), "check_budget", "Check what Penny found", "/safe-to-spend/reading"],
    ["3 more went out than came in", with_({ lastMonth: { incomeCents: 100_000, spentCents: 120_000 } }), "cover_essentials", "See your month", "/safe-to-spend?tab=month"],
    [
      "4 an approved card without autopay",
      with_({}, { approvedCards: [{ applicationId: CARD_A, name: "Discover it Student", autopay: "off" }] }),
      "turn_on_autopay",
      "Turn on autopay",
      `/applications/${CARD_A}/setup/autopay`,
    ],
    ["5 savings under the cushion", with_({ savingsCents: 50_000 }), "start_emergency_fund", "Start my emergency fund", "/start/goal?preset=emergency_fund"],
    ["7 no card anywhere, quiz not done", with_({ hasCardAccount: false }), "find_a_card", "Take the card quiz", "/quiz"],
    ["7 no card anywhere, quiz found a match", with_({ hasCardAccount: false }, { quiz: "match" }), "find_a_card", "See your matches", "/results"],
    ["7 no card anywhere, quiz found none that fits", with_({ hasCardAccount: false }, { quiz: "no_card" }), "find_a_card", "See why", "/results"],
    ["9 otherwise, no goal", DONE, "your_goals", "Pick a goal", "/start/goal"],
  ])("%s", (_name, inputs, id, label, href) => {
    const step = nextStep(inputs);
    expect(step.id).toBe(id);
    expect(step.action).toEqual({ label, href });
    expect(step.title.length).toBeGreaterThan(0);
    expect(step.why.length).toBeGreaterThan(0);
  });

  it("only ever returns a shipped rule", () => {
    expect([...NEXT_STEP_IDS]).toEqual(["link_bank", "check_budget", "cover_essentials", "turn_on_autopay", "start_emergency_fund", "find_a_card", "your_goals"]);
  });
});

describe("nextStep: order", () => {
  // Every trigger at once, then each removed in turn: the next one in order answers.
  const ALL: NextStepInputs = {
    bank: { answered: false, budgetChecked: false, lastMonth: { incomeCents: 0, spentCents: 50_000 }, essentialsCents: 0, savingsCents: null, hasCardAccount: false },
    approvedCards: [{ applicationId: CARD_A, name: "Card A", autopay: "off" }],
    cardTracked: false,
    quiz: "unfinished",
    goal: null,
  };
  it("goes link, check, essentials, autopay, emergency fund, a card, goals", () => {
    const seen: string[] = [];
    const inputs = structuredClone(ALL);
    seen.push(nextStep({ ...inputs, bank: null }).id);
    seen.push(nextStep(inputs).id);
    inputs.bank!.answered = true;
    inputs.bank!.budgetChecked = true;
    seen.push(nextStep(inputs).id);
    inputs.bank!.lastMonth = null;
    seen.push(nextStep(inputs).id);
    inputs.approvedCards = [];
    seen.push(nextStep(inputs).id);
    inputs.bank!.savingsCents = 100_000;
    seen.push(nextStep(inputs).id);
    inputs.bank!.hasCardAccount = true;
    seen.push(nextStep(inputs).id);
    expect(seen).toEqual(["link_bank", "check_budget", "cover_essentials", "turn_on_autopay", "start_emergency_fund", "find_a_card", "your_goals"]);
  });

  it("puts the emergency fund before a card (Ben, Nov 21)", () => {
    expect(nextStep(with_({ hasCardAccount: false, savingsCents: 0 })).id).toBe("start_emergency_fund");
  });
});

describe("nextStep: edges", () => {
  it("a bank not read yet asks to read it before judging anything from it", () => {
    const step = nextStep(with_({ answered: false, lastMonth: { incomeCents: 0, spentCents: 90_000 }, savingsCents: null }));
    expect(step.id).toBe("check_budget");
    expect(step.why).toBe("Penny reads your pay and bills from your bank. Then you check they look right.");
  });

  it("a read bank asks to check what Penny found, never promising a last month it may not have", () => {
    const step = nextStep(with_({ budgetChecked: false, lastMonth: null }));
    expect(step.why).toBe("Penny read your pay and bills from your bank. Make sure they look right.");
    expect(step.why).not.toMatch(/last month/i);
  });

  it("a thin history (last month not whole) never says more went out than came in", () => {
    expect(nextStep(with_({ lastMonth: null })).id).toBe("your_goals");
  });

  it("money out equal to money in is not overspending", () => {
    expect(nextStep(with_({ lastMonth: { incomeCents: 100_000, spentCents: 100_000 } })).id).toBe("your_goals");
  });

  it("says what came in and went out last month", () => {
    expect(nextStep(with_({ lastMonth: { incomeCents: 100_000, spentCents: 125_050 } })).why).toBe(
      "Last month $1,250.50 went out and $1,000 came in. Rent, bills and food come first.",
    );
  });

  it("says a card has no autopay only when the student said so, and asks when Cense doesn't know", () => {
    expect(nextStep(with_({}, { approvedCards: [{ applicationId: CARD_A, name: "Card A", autopay: "off" }] })).why).toMatch(/^Card A has no autopay yet\./);
    const unknown = nextStep(with_({}, { approvedCards: [{ applicationId: CARD_A, name: "Card A", autopay: "unknown" }] }));
    expect(unknown.id).toBe("turn_on_autopay");
    expect(unknown.why).toMatch(/^Tell us if Card A has autopay\./);
    expect(unknown.why).not.toMatch(/no autopay/);
  });

  it("with two cards, names the most recent one without autopay", () => {
    const step = nextStep(
      with_({}, {
        approvedCards: [
          { applicationId: CARD_A, name: "Card A", autopay: "on" },
          { applicationId: CARD_B, name: "Card B", autopay: "off" },
        ],
      }),
    );
    expect(step.id).toBe("turn_on_autopay");
    expect(step.action.href).toBe(`/applications/${CARD_B}/setup/autopay`);
    expect(step.why).toMatch(/^Card B has no autopay yet\./);
    // Both on: autopay is done.
    expect(nextStep(with_({}, { approvedCards: [{ applicationId: CARD_A, name: "A", autopay: "on" }, { applicationId: CARD_B, name: "B", autopay: "on" }] })).id).toBe("your_goals");
  });

  it("the cushion is $1,000 or a month of essentials, whichever is more", () => {
    expect(emergencyTargetCents(0)).toBe(100_000);
    expect(emergencyTargetCents(92_500)).toBe(100_000);
    expect(emergencyTargetCents(140_000)).toBe(140_000);
    // Savings exactly at the cushion is enough.
    expect(nextStep(with_({ essentialsCents: 140_000, savingsCents: 140_000 })).id).toBe("your_goals");
    expect(nextStep(with_({ essentialsCents: 140_000, savingsCents: 139_999 })).id).toBe("start_emergency_fund");
  });

  it("with no savings account, counts $0 and says Cense doesn't see one; otherwise says savings and similar accounts", () => {
    const step = nextStep(with_({ savingsCents: null }));
    expect(step.id).toBe("start_emergency_fund");
    expect(step.why).toBe("Cense doesn’t see a savings account. A first cushion is $1,000, or a month of rent, bills and groceries if that’s more: $1,000 for you.");
    expect(nextStep(with_({ savingsCents: 50_000 })).why).toMatch(/^You have \$500 in savings and similar accounts\./);
  });

  it("an emergency fund goal already started moves past the emergency fund, accepted or not", () => {
    const goal = { preset: "emergency_fund", name: "Emergency fund" } as const;
    expect(nextStep(with_({ savingsCents: 0 }, { goal: { ...goal, accepted: false } })).id).toBe("your_goals");
    expect(nextStep(with_({ savingsCents: 0 }, { goal: { ...goal, accepted: true } })).id).toBe("your_goals");
  });

  // The student's own accepted plan stands (Gap Plan: show, don't prescribe);
  // a goal only saved still gets the emergency fund first.
  it("another goal's accepted plan is not pushed aside for the emergency fund; one only saved is", () => {
    expect(nextStep(with_({ savingsCents: 0 }, { goal: { preset: "trip", name: "Trip", accepted: true } })).id).toBe("your_goals");
    expect(nextStep(with_({ savingsCents: 0 }, { goal: { preset: "pay_off_card", name: "Pay off my card", accepted: true } })).id).toBe("your_goals");
    expect(nextStep(with_({ savingsCents: 0 }, { goal: { preset: "trip", name: "Trip", accepted: false } })).id).toBe("start_emergency_fund");
  });

  it("a goal opens Your plan, saying whether it is accepted", () => {
    const ready = nextStep(with_({}, { goal: { preset: "trip", name: "Trip", accepted: false } }));
    expect(ready.action).toEqual({ label: "See your plan", href: "/start/plan" });
    expect(ready.why).toBe("Your plan for Trip is ready. Accept it to set money aside each month.");
    const set = nextStep(with_({}, { goal: { preset: "trip", name: "Trip", accepted: true } }));
    expect(set.action).toEqual({ label: "See your plan", href: "/start/plan" });
    expect(set.why).toBe("Your plan for Trip is set. Change it anytime.");
  });

  it("a tracked card, approved, waiting or turned down, is not a missing card", () => {
    const noBankCard = { hasCardAccount: false };
    expect(nextStep(with_(noBankCard, { cardTracked: true })).id).toBe("your_goals");
    expect(nextStep(with_(noBankCard, { approvedCards: [{ applicationId: CARD_A, name: "A", autopay: "on" }], cardTracked: true })).id).toBe("your_goals");
  });

  it("never says first card (Mikhaela, Nov 9: it may not be their first)", () => {
    const step = nextStep(with_({ hasCardAccount: false }));
    expect(step.title).toBe("Find a card that fits");
    expect(`${step.title} ${step.why}`).not.toMatch(/first card/i);
  });
});

describe("nextStepInputs", () => {
  const app = (id: string, status: Application["status"]): Application => ({
    id,
    cardId: null,
    cardName: `Card ${id.slice(-1)}`,
    status,
    creditLimitCents: null,
    appliedAt: null,
    statusUpdatedAt: "2026-11-20T00:00:00.000Z",
  });
  const money = {
    answered: true,
    accounts: [
      { name: "Checking", mask: "0000", kind: "cash", balanceCents: 124_000 },
      { name: "Saving", mask: "1111", kind: "other", balanceCents: 50_000 },
      { name: "Money market", mask: "2222", kind: "other", balanceCents: 10_000 },
      { name: "Card", mask: "3333", kind: "card", balanceCents: 31_000 },
    ],
    bills: [
      { bill: "rent", coveredBy: "me", monthlyCents: 65_000, dueDay: 6 },
      { bill: "groceries", coveredBy: "me", monthlyCents: 27_500, dueDay: 7 },
      { bill: "tuition", coveredBy: "me", monthlyCents: 150_000, dueDay: null },
    ],
  } as SafeToSpend;
  const line = (amountCents: number) => ({ key: "x", label: "x", group: "need" as const, amountCents, bankCents: amountCents, typed: false, recurrence: null });
  const budget = { hasBankData: true, income: line(180_000), needs: [line(65_000), line(27_500)], wants: [line(13_200)], saving: line(16_667) } as unknown as Budget;
  const goal = { preset: "emergency_fund", name: "Emergency fund", acceptedMonthlyCents: null } as Goal;
  const base = { safeToSpend: money, budgetChecked: true, lastMonth: null, applications: [], approvedCards: [], leadingCardId: null, quiz: "unfinished" as const, goal: null };

  it("adds savings accounts, essentials without tuition, and money out without the set-aside", () => {
    const inputs = nextStepInputs({ ...base, lastMonth: budget, goal });
    expect(inputs.bank).toEqual({
      answered: true,
      budgetChecked: true,
      lastMonth: { incomeCents: 180_000, spentCents: 105_700 },
      essentialsCents: 92_500,
      savingsCents: 60_000,
      hasCardAccount: true,
    });
    expect(inputs.goal).toEqual({ preset: "emergency_fund", name: "Emergency fund", accepted: false });
  });

  it("no savings account is null, not $0; no bank is null; a budget with no bank data is no month", () => {
    const checkingOnly = { ...money, accounts: money.accounts.filter((account) => account.kind === "cash") };
    const inputs = nextStepInputs({ ...base, safeToSpend: checkingOnly, budgetChecked: false, lastMonth: { ...budget, hasBankData: false } });
    expect(inputs.bank?.savingsCents).toBeNull();
    expect(inputs.bank?.hasCardAccount).toBe(false);
    expect(inputs.bank?.lastMonth).toBeNull();
    expect(nextStepInputs({ ...base, safeToSpend: null }).bank).toBeNull();
  });

  it("keeps approved cards in the tracked order with Coming up's names and autopay, leaving out the one Home leads with", () => {
    const CARD_C = "00000000-0000-4000-8000-00000000000c";
    const inputs = nextStepInputs({
      ...base,
      applications: [app(CARD_C, "approved"), app(CARD_B, "approved"), app(CARD_A, "approved")],
      approvedCards: [
        { applicationId: CARD_A, name: "Discover (1234)", autopayStatus: "unknown" },
        { applicationId: CARD_B, name: "Capital One", autopayStatus: "on" },
        { applicationId: CARD_C, name: "Chase", autopayStatus: "off" },
      ],
      leadingCardId: CARD_C,
      quiz: "match",
      goal: { ...goal, acceptedMonthlyCents: 16_667 },
    });
    // The leading card's star on Home already asks for its autopay.
    expect(inputs.approvedCards).toEqual([
      { applicationId: CARD_B, name: "Capital One", autopay: "on" },
      { applicationId: CARD_A, name: "Discover (1234)", autopay: "unknown" },
    ]);
    expect(inputs.cardTracked).toBe(true);
    expect(inputs.quiz).toBe("match");
    expect(inputs.goal?.accepted).toBe(true);
  });

  it("counts any tracked card, the leading approved one included, as tracked", () => {
    expect(nextStepInputs({ ...base, applications: [app(CARD_A, "approved")], leadingCardId: CARD_A }).cardTracked).toBe(true);
    expect(nextStepInputs({ ...base, applications: [app(CARD_A, "applied")] }).cardTracked).toBe(true);
    expect(nextStepInputs({ ...base, applications: [app(CARD_A, "rejected")] }).cardTracked).toBe(true);
    expect(nextStepInputs({ ...base }).cardTracked).toBe(false);
  });
});
