"use client";

// Created with Claude Code (2026-11-13). Your money, Today (Figma D2,
// 709:1520): how the daily number adds up. Rows from the bank are read only;
// rows the student typed (their bills and the set-aside) are edited right on
// the page and saved as the same answers Change your answers saves
// (PUT /safe-to-spend/answers). Disconnect lives on Accounts (E4), not here.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { minusMoney, signedMoney } from "@/components/safe-to-spend/parts";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { EditRow, GroupHeading, MoneyHero, MoneyTabs, ReadRow, TotalRow } from "@/components/your-money/parts";
import { track } from "@/lib/analytics";
import { parseAmount, refreshBank, saveSafeToSpendAnswers, type SafeToSpendData } from "@/lib/api-client/safe-to-spend";
import { ordinalDay, YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { centsToInput, moneyAmount } from "@/lib/money";
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

// "You cover it · due the 15th" (709:1551); "Your share" for a split bill.
// A bill whose day has passed this month is out of the sum already.
function billLine(answer: BillAnswer, today: number): string {
  const who = answer.coveredBy === "split" ? "Your share" : "You cover it";
  if (answer.dueDay === null) return `${who} · ${YOUR_MONEY_COPY.eachMonth.toLowerCase()}`;
  const due = `due ${ordinalDay(answer.dueDay)}`;
  return billCents(answer, today) === 0 ? `${who} · ${due}, done this month` : `${who} · ${due}`;
}

function initialValues(data: SafeToSpendData): Record<FieldKey, string> {
  const values = { [SET_ASIDE]: centsToInput(data.setAsideCents) } as Record<FieldKey, string>;
  for (const answer of paidBills(data.bills as BillAnswer[])) values[answer.bill] = centsToInput(answer.monthlyCents);
  return values;
}

export function TodayTab({ data, today }: { data: SafeToSpendData; today: number }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const now = useNow();
  const bills = data.bills as BillAnswer[];
  const [values, setValues] = useState(() => initialValues(data));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState<FieldKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    track("your_money_viewed", { tab: "today" });
  }, []);

  // What a field holds, as cents: empty is $0, anything else not an amount is null.
  const typed = (key: FieldKey): number | null => (values[key].trim() === "" ? 0 : parseAmount(values[key]));
  const saved = (key: FieldKey): number =>
    key === SET_ASIDE ? data.setAsideCents : (bills.find((answer) => answer.bill === key)?.monthlyCents ?? 0);

  // The answers with what is typed, a field that is not an amount keeping its saved number.
  const withTyped = (): { bills: BillAnswer[]; setAsideCents: number } => ({
    bills: bills.map((answer) =>
      answer.coveredBy === "me" || answer.coveredBy === "split" ? { ...answer, monthlyCents: typed(answer.bill) ?? answer.monthlyCents } : answer,
    ),
    setAsideCents: typed(SET_ASIDE) ?? data.setAsideCents,
  });
  // The sum as the student types.
  const sum = computeSafeToSpend({ accounts: data.accounts, ...withTyped(), today });

  async function commit(key: FieldKey) {
    const cents = typed(key);
    if (cents === null) {
      setErrors((current) => ({ ...current, [key]: YOUR_MONEY_COPY.invalidAmount }));
      return;
    }
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (cents === saved(key) || saving) return;
    setSaving(key);
    const answers = withTyped();
    const result = await saveSafeToSpendAnswers({ bills: answers.bills, setAsideCents: answers.setAsideCents });
    if (!isMounted()) return;
    setSaving(null);
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpend));
    if (result.kind === "failed") {
      setErrors((current) => ({ ...current, [key]: result.message }));
      return;
    }
    track("money_amount_saved", { tab: "today", line: key === SET_ASIDE ? "set_aside" : "bill" });
    setValues((current) => ({ ...current, [key]: centsToInput(cents) }));
    router.refresh();
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
  const field = (key: FieldKey, label: string, sub: string, fieldLabel: string) => (
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
        setValues((current) => ({ ...current, [key]: value }));
        if (errors[key] && (value.trim() === "" || parseAmount(value) !== null)) setErrors((current) => ({ ...current, [key]: undefined }));
      }}
      onCommit={() => void commit(key)}
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
          {field(SET_ASIDE, YOUR_MONEY_COPY.setAside, YOUR_MONEY_COPY.eachMonth, "Set aside each month")}
          <TotalRow label={`Left for ${sum.days} days · ${moneyAmount(sum.dailyCents)} a day`} value={signedMoney(sum.leftCents)} />
        </ul>
        {sum.leftCents < 0 ? <p className="text-body-s text-indigo-black">Cards, bills and set aside are more than your checking.</p> : null}
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
