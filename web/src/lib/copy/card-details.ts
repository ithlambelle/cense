// Created with Claude Code (2026-11-19). The words on a card's page in
// sections (Flow 2: K2 "Your match" 821:8793, K1 "Your card" 821:8748, Figma
// gPofkJWVZ2wUWyF9SfHW6O): each section's title, its one-line summary and the
// lines inside. Summaries are built from data the app already keeps; the
// frames' sample values (Discover, day 18, $150) are only examples.
import type { ApplicationDetail } from "../api/application";
import type { Card } from "../cards/catalog";
import type { CardRewards, RewardRate } from "../cards/rewards";
import type { ReminderStatus } from "../home/state";
import { moneyAmount } from "../money";
import type { YearOneEstimate } from "../results/value";
import type { CardFit } from "../rules/fit-tier";
import { paymentTypeLabel } from "../setup/progress";
import { rateAmount, valueLine, whyLines, type WhyLine } from "./results";

export const SECTION_TITLES = {
  why: "Why it fits you",
  issuer: "What the issuer looks for",
  rewards: "Rewards",
  fees: "Fees and rates",
  dates: "Your dates",
  autopay: "Autopay and reminders",
  spendLimit: "Spend limit",
} as const;

export const NOT_SET = "Not set yet";

// "Made for students, like you." reads as a summary without its full stop.
function asSummary(text: string): string {
  return text.replace(/\.$/, "");
}

// The fit row beside the signal bars (K2): "$48 year one, est.". Null without an estimate.
export function estimateShort(estimate: YearOneEstimate | null): string | null {
  const line = valueLine(estimate);
  return line?.amount ? `${line.amount} year one, est.` : null;
}

// "Why it fits you" (K2): the frame's lines are the reason the card fits, its
// value and its bonus, the result's "Why it's right for you" in the same
// order. The Likely fit bars already say approval is likely, so for a likely
// fit the first line is the reason itself; a stretch keeps "Approval is less
// certain for you" with the caution under it. Null for a card that does not
// fit (not yet) or with no quiz.
export function whyItFits(
  fit: CardFit | null,
  rewards: CardRewards | null,
  estimate: YearOneEstimate | null,
): { summary: string; lines: WhyLine[] } | null {
  if (!fit || fit.tier === "not_yet") return null;
  const lines = whyLines({ fit, rewards, estimate }).map((line): WhyLine =>
    line.id === "approval" && fit.tier === "likely_fit" && line.detail
      ? { ...line, mark: "check", text: line.detail, amount: null, detail: null }
      : line,
  );
  return { summary: asSummary(lines[0].text), lines };
}

// "What the issuer looks for": "From Discover’s own rules".
export function issuerRulesSummary(brand: string): string {
  return `From ${brand}’s own rules`;
}

function rateWithUnit(rate: Pick<RewardRate, "amount" | "unit">): string {
  return rate.unit === "percent" ? `${rateAmount(rate)} back` : `${rateAmount(rate)} points`;
}

// "Rewards", closed: the top rate and the rate on everything else, as
// "5% in rotating categories, 1% on the rest" (K1, K2). The top rate is the
// first of the highest, in the issuer's order.
export function rewardsSummary(rewards: CardRewards | null): string {
  if (!rewards || rewards.rates.length === 0) return "No rewards on purchases";
  const base = rewards.rates.find((rate) => rate.earnsOn === "all") ?? null;
  const others = rewards.rates.filter((rate) => rate !== base);
  const top = others.reduce<RewardRate | null>((best, rate) => (best === null || rate.amount > best.amount ? rate : best), null);
  if (!top || (base && top.amount <= base.amount)) return base ? `${rateWithUnit(base)} on everything` : "No rewards on purchases";
  const lead = top.rotating ? `${rateAmount(top)} in rotating categories` : `Up to ${rateWithUnit(top)}`;
  return base ? `${lead}, ${rateAmount(base)} on the rest` : lead;
}

// "Fees and rates", closed: "$0 annual fee · 0% foreign fee".
export function feesSummary(card: Pick<Card, "annualFeeCents" | "foreignTransactionFeePercent">): string {
  return `${moneyAmount(card.annualFeeCents)} annual fee · ${card.foreignTransactionFeePercent}% foreign fee`;
}

// "Fees and rates", open: the facts the card page always showed, one a line.
export function feeLines(
  card: Pick<Card, "annualFeeCents" | "foreignTransactionFeePercent" | "secured" | "depositMinCents" | "runsCreditCheck">,
): string[] {
  return [
    `Annual fee · ${moneyAmount(card.annualFeeCents)}`,
    `Foreign fee · ${card.foreignTransactionFeePercent}%`,
    ...(card.secured && card.depositMinCents > 0 ? [`Deposit · From ${moneyAmount(card.depositMinCents)}`] : []),
    `Credit check · ${card.runsCreditCheck ? "Yes" : "No"}`,
  ];
}

type Days = Pick<ApplicationDetail, "statementClosingDay" | "paymentDueDay">;

// "Your dates" (K1). The frame adds "from your bank": that waits on linked
// bank due dates (PR #112), so these are the days the student saved.
export function datesSummary(days: Days): string {
  if (days.statementClosingDay === null || days.paymentDueDay === null) return NOT_SET;
  return `Statement closes day ${days.statementClosingDay} · due day ${days.paymentDueDay}`;
}

export function dateLines(days: Days): string[] {
  return [
    ...(days.statementClosingDay !== null ? [`Statement closes · Day ${days.statementClosingDay}`] : []),
    ...(days.paymentDueDay !== null ? [`Payment due · Day ${days.paymentDueDay}`] : []),
  ];
}

type Autopay = Pick<ApplicationDetail, "autopayStatus" | "autopayPaymentType">;

const AUTOPAY_WORDS: Record<ApplicationDetail["autopayStatus"], string> = {
  on: "On",
  off: "Off",
  unknown: NOT_SET,
};

const REMINDER_WORDS: Record<ReminderStatus, string> = {
  on: "On",
  off: "Off",
  not_set: NOT_SET,
};

// "Autopay and reminders", closed: "Autopay on · reminders on". The frame's
// "a reminder before each date" is not always true (with autopay on, no
// due-date email is sent, and either email can be off), so it says on or off.
export function autopaySummary(autopay: Autopay, reminders: ReminderStatus): string {
  return `Autopay ${AUTOPAY_WORDS[autopay.autopayStatus].toLowerCase()} · reminders ${REMINDER_WORDS[reminders].toLowerCase()}`;
}

// Open: "Autopay · On, statement balance" and "Reminders · On".
export function autopayLines(autopay: Autopay, reminders: ReminderStatus): string[] {
  const paid = autopay.autopayStatus === "on" ? paymentTypeLabel(autopay.autopayPaymentType) : null;
  const status = AUTOPAY_WORDS[autopay.autopayStatus];
  return [`Autopay · ${paid ? `${status}, ${paid.toLowerCase()}` : status}`, `Reminders · ${REMINDER_WORDS[reminders]}`];
}

type Limits = Pick<ApplicationDetail, "spendLimitCents" | "creditLimitCents">;

// "Spend limit", closed: "$150 a month, your pick" (the student picks or
// accepts every saved limit, Flow A).
export function spendLimitSummary(limits: Limits): string {
  return limits.spendLimitCents === null ? NOT_SET : `${moneyAmount(limits.spendLimitCents)} a month, your pick`;
}

export function spendLimitLines(limits: Limits): string[] {
  return [
    ...(limits.spendLimitCents !== null ? [`Spend limit · ${moneyAmount(limits.spendLimitCents)} a month`] : []),
    ...(limits.creditLimitCents !== null ? [`Credit limit · ${moneyAmount(limits.creditLimitCents)}`] : []),
  ];
}
