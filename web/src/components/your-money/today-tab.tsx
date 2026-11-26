"use client";

// Created with Claude Code (2026-11-13). Your money, Today (Figma D2,
// 709:1520): how the daily number adds up. Rows from the bank are read only;
// rows the student typed (their bills and the savings goal) are edited right on
// the page and saved as the same answers Change your answers saves
// (PUT /safe-to-spend/answers). Disconnect lives on Accounts (E4), not here.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { minusMoney, signedMoney } from "@/components/safe-to-spend/parts";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { amountInput, EditRow, GroupHeading, MoneyHero, MoneyTabs, ReadRow, TotalRow, type SavedAnswers, type SharedAnswers } from "@/components/your-money/parts";
import { track } from "@/lib/analytics";
import { parseAmount, refreshBank, saveSafeToSpendAnswers, type SafeToSpendData } from "@/lib/api-client/safe-to-spend";
import { ordinalDay, YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { moneyAmount } from "@/lib/money";
import { ROUTES, signInPath } from "@/lib/routes";
import { BILL_COPY, SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";
import { billCents, computeSafeToSpend, type Bill, type BillAnswer } from "@/lib/safe-to-spend/compute";
import { useIsMounted } from "@/lib/use-is-mounted";
import { useNow } from "@/lib/use-now";

const SET_ASIDE = "set_aside";
type FieldKey = Bill | typeof SET_ASIDE;

// The bills the student pays some of: the rows "From you" shows.
function paidBills(bills: BillAnswer[]): BillAnswer[] {
  return bills.filter((answer) => answer.coveredBy === "me" || answer.coveredBy === "split");
}

// "Due the 15th" (709:1551, without "You cover it", Ben, Nov 14), and
// "Your share · due the 15th" for a split bill. A bill whose day has passed
// this month is out of the sum already: "Due the 12th, done this month". A
// bill with no due day (tuition) has no line, or just "Your share".
function billLine(answer: BillAnswer, today: number): string | null {
  const share = answer.coveredBy === "split" ? "Your share" : null;
  if (answer.dueDay === null) return share;
  // Groceries have no due day: Penny's reading keeps them reserved all month
  // with day 31 (lib/safe-to-spend/infer.ts), which is not a date to show.
  if (answer.bill === "groceries" && answer.dueDay === 31) return share ? `${share} · through the month` : "Through the month";
  const day = ordinalDay(answer.dueDay);
  const done = billCents(answer, today) === 0 ? ", done this month" : "";
  return share ? `${share} · due ${day}${done}` : `Due ${day}${done}`;
}

function initialValues(answers: SavedAnswers): Record<FieldKey, string> {
  const values = { [SET_ASIDE]: amountInput(answers.setAsideCents) } as Record<FieldKey, string>;
  for (const answer of paidBills(answers.bills)) values[answer.bill] = amountInput(answer.monthlyCents);
  return values;
}

// `shared` holds the bills and savings goal for both tabs (YourMoneyView), so
// a save finished after the student switched tabs is never lost.
export function TodayTab({ data, today, shared, hasGoal = false }: { data: SafeToSpendData; today: number; shared: SharedAnswers; hasGoal?: boolean }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const now = useNow();
  const bills = shared.answers.bills;
  const [values, setValues] = useState(() => initialValues(shared.answers));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState<FieldKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    track("your_money_viewed", { tab: "today" });
  }, []);

  // What a field holds, as cents: empty is $0, anything else not an amount is null.
  const typedIn = (from: Record<FieldKey, string>, key: FieldKey): number | null =>
    from[key].trim() === "" ? 0 : parseAmount(from[key]);

  // The answers with what is typed over `saved`, a field that is not an
  // amount keeping its saved number.
  const answersFrom = (from: Record<FieldKey, string>, saved: (key: FieldKey) => number): SavedAnswers => ({
    bills: shared.latest().bills.map((answer) =>
      answer.coveredBy === "me" || answer.coveredBy === "split" ? { ...answer, monthlyCents: typedIn(from, answer.bill) ?? saved(answer.bill) } : answer,
    ),
    setAsideCents: typedIn(from, SET_ASIDE) ?? saved(SET_ASIDE),
  });
  // The saved number, from the copy both tabs share.
  const savedIn = (key: FieldKey): number => {
    const saved = shared.latest();
    return key === SET_ASIDE ? saved.setAsideCents : (saved.bills.find((answer) => answer.bill === key)?.monthlyCents ?? 0);
  };
  // The sum as the student types.
  const sum = computeSafeToSpend({ accounts: data.accounts, ...answersFrom(values, savedIn), today });

  // Saves run one after another in the page's queue, each with the fields as
  // they are when it runs, so a quick second edit is never dropped or
  // overwritten by the first.
  const latest = useRef(values);

  function setValue(key: FieldKey, value: string) {
    latest.current = { ...latest.current, [key]: value };
    setValues(latest.current);
  }

  function commit(key: FieldKey) {
    if (typedIn(latest.current, key) === null) {
      setErrors((current) => ({ ...current, [key]: YOUR_MONEY_COPY.invalidAmount }));
      return;
    }
    setErrors((current) => ({ ...current, [key]: undefined }));
    void shared.enqueue(() => save(key));
  }

  async function save(key: FieldKey) {
    const from = latest.current;
    const cents = typedIn(from, key);
    if (cents === null || cents === savedIn(key)) return;
    setSaving(key);
    const answers = answersFrom(from, savedIn);
    const result = await saveSafeToSpendAnswers(answers);
    // Recorded and refreshed even if the student has switched tabs meanwhile.
    if (result.kind === "ok") {
      shared.saved(answers);
      track("money_amount_saved", { tab: "today", line: key === SET_ASIDE ? "set_aside" : "bill" });
      router.refresh();
    }
    if (!isMounted()) return;
    setSaving(null);
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpend));
    if (result.kind === "failed") {
      setErrors((current) => ({ ...current, [key]: result.message }));
      return;
    }
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    const result = await refreshBank();
    if (!isMounted()) return;
    setRefreshing(false);
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpend));
    if (result.kind === "ok" || result.code === "reconnect_needed" || result.code === "relink_needed") return router.refresh();
    setRefreshError(result.message);
  }

  const broken = data.status !== "active";
  const time = (options: Intl.DateTimeFormatOptions) =>
    now && data.refreshedAt ? new Date(data.refreshedAt).toLocaleString("en-US", options) : "";
  const field = (key: FieldKey, label: string, sub: ReactNode, fieldLabel: string) => (
    <EditRow
      key={key}
      id={`your-money-${key}`}
      label={label}
      sub={sub}
      fieldLabel={fieldLabel}
      value={values[key]}
      invalid={errors[key] !== undefined}
      error={errors[key]}
      pending={saving === key}
      onChange={(value) => {
        setValue(key, value);
        if (errors[key] && (value.trim() === "" || parseAmount(value) !== null)) setErrors((current) => ({ ...current, [key]: undefined }));
      }}
      onCommit={() => commit(key)}
    />
  );

  return (
    <>
      <MoneyHero
        label={YOUR_MONEY_COPY.todayLabel}
        amount={broken ? <span className="text-[20px] leading-7">{data.status === "reconnect_needed" ? SAFE_TO_SPEND_COPY.reconnect : SAFE_TO_SPEND_COPY.relink}</span> : moneyAmount(sum.dailyCents)}
        unit={broken ? undefined : " a day"}
        left={broken ? <Link href={ROUTES.accounts} className="font-semibold underline underline-offset-2 hover:text-light-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-off-white">{data.status === "reconnect_needed" ? "Reconnect your bank" : "Connect again"}</Link> : `For the next ${sum.days} days`}
        right={broken ? null : <span suppressHydrationWarning>{time({ hour: "numeric", minute: "2-digit" }) && `Updated ${time({ hour: "numeric", minute: "2-digit" })}`}</span>}
      />
      <MoneyTabs active="today" />

      <section aria-labelledby="from-bank" className="flex flex-col gap-2">
        <GroupHeading id="from-bank">{YOUR_MONEY_COPY.fromBank}</GroupHeading>
        {broken ? <p className="text-body-s text-indigo-black/70">{SAFE_TO_SPEND_COPY.lastNumbers}</p> : null}
        <ul aria-labelledby="from-bank" className="flex flex-col gap-2">
          <ReadRow label={YOUR_MONEY_COPY.cash} value={moneyAmount(sum.cashCents)} />
          <ReadRow label={YOUR_MONEY_COPY.cards} value={minusMoney(sum.cardCents)} />
        </ul>
      </section>

      <section aria-labelledby="from-you" className="flex flex-col gap-2">
        <GroupHeading id="from-you">{YOUR_MONEY_COPY.fromYou}</GroupHeading>
        <ul aria-labelledby="from-you" className="flex flex-col gap-2">
          {paidBills(bills).map((answer) =>
            field(answer.bill, BILL_COPY[answer.bill].label, billLine(answer, today), `${BILL_COPY[answer.bill].label} each month`),
          )}
          {field(
            SET_ASIDE,
            YOUR_MONEY_COPY.setAside,
            // The way back to the goal behind the set-aside (Pick a goal).
            <Link href={ROUTES.startGoal} className="font-semibold text-violet underline underline-offset-2 hover:text-violet-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {hasGoal ? YOUR_MONEY_COPY.changeGoal : YOUR_MONEY_COPY.setGoal}
            </Link>,
            YOUR_MONEY_COPY.setAside,
          )}
          {/* No line break inside "$4.33 a day" at 320. */}
          <TotalRow label={`Left for ${sum.days} days · ${moneyAmount(sum.dailyCents)}\u00a0a\u00a0day`} value={signedMoney(sum.leftCents)} />
        </ul>
        {sum.leftCents < 0 ? <p className="text-body-s text-indigo-black">Cards, bills and your savings goal are more than your checking.</p> : null}
      </section>

      {refreshError ? <ErrorMessage>{refreshError}</ErrorMessage> : null}
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-indigo-black/70" suppressHydrationWarning>
          {time({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) &&
            `Updated ${time({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
        </p>
        <Button type="button" variant="secondary" className="h-9 w-auto px-3" pending={refreshing} onClick={refresh}>
          Refresh
        </Button>
      </div>
    </>
  );
}
