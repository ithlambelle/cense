// Created with Claude Code (2026-11-13). The pieces both Your money tabs are
// built from (Figma 709:1520 Today, 709:1769 This month, 709:1865 Short):
// the designers' navy hero (371:13007), the two tabs, read-only rows, rows
// with an amount the student edits in place, and the total row.
import Link from "next/link";
import type { ReactNode } from "react";

import { PreviewLabel } from "@/components/safe-to-spend/parts";
import { SENSITIVE } from "@/lib/analytics";
import { YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { yourMoneyPath, type YourMoneyTab } from "@/lib/routes";
import { cn } from "@/lib/utils";

// The navy hero: a label, the big number in Unbounded Bold 44 Light Blue, and
// one line under it (left and right). The number is the student's money, so it
// is masked in session replay.
export function MoneyHero({
  label,
  amount,
  unit,
  left,
  right,
  preview = true,
}: {
  label: string;
  amount: ReactNode;
  // " a day" after the number, at 20px (709:1528)
  unit?: string;
  left: ReactNode;
  right?: ReactNode;
  preview?: boolean;
}) {
  return (
    <section aria-label={label.replace(/:$/, "")} className="flex min-h-[150px] flex-col rounded-[28px] bg-navy px-[23px] pt-[22px] pb-[18px] text-white">
      <div className="flex min-h-9 items-start justify-between gap-3">
        <p className="text-body-m leading-[18px] font-semibold">{label}</p>
        {preview ? <PreviewLabel onNavy className="-mt-0.5" /> : null}
      </div>
      <p className={cn(SENSITIVE, "-mt-[7px] font-number text-[44px] leading-[44px] font-bold text-light-blue")}>
        {amount}
        {unit ? <span className="text-[20px]">{unit}</span> : null}
      </p>
      <div className="flex items-start justify-between gap-3 pt-[13px] text-body-s leading-4">
        <p>{left}</p>
        {right ? <p className="shrink-0 text-right">{right}</p> : null}
      </div>
    </section>
  );
}

// The two tabs (709:1535): an Off-white track, the open tab a white pill with
// a 35% Amethyst edge. Each is a link, so a reload keeps the tab; it replaces
// the history entry, so Back leaves Your money instead of swapping tabs.
export function MoneyTabs({ active }: { active: YourMoneyTab }) {
  const tab = (key: YourMoneyTab, label: string) => {
    const open = key === active;
    return (
      <Link
        href={yourMoneyPath(key)}
        replace
        scroll={false}
        aria-current={open ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center rounded-pill border-[1.5px] py-2.5 text-body-s focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          open ? "border-violet/35 bg-white font-semibold text-navy" : "border-transparent font-medium text-indigo-black/70 hover:text-indigo-black",
        )}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label={YOUR_MONEY_COPY.title} className="flex gap-1 rounded-pill bg-off-white p-1">
      {tab("today", YOUR_MONEY_COPY.tabs.today)}
      {tab("month", YOUR_MONEY_COPY.tabs.month)}
    </nav>
  );
}

// A group heading: Inter Semi Bold 16, Deep navy (709:1540).
export function GroupHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-body-m font-semibold text-navy">
      {children}
    </h2>
  );
}

// A row from the bank, read only (709:1541): label left, amount right, an
// Off-white line under it.
export function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-off-white py-2 text-body-m text-indigo-black">
      <span className="min-w-0 flex-1">{label}</span>
      <span className={cn(SENSITIVE, "shrink-0 tabular-nums")}>{value}</span>
    </li>
  );
}

// The total row (709:1566): a hairline above, Semi Bold.
export function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 border-t border-hairline py-2 text-body-m font-semibold text-indigo-black">
      <span className={cn(SENSITIVE, "min-w-0 flex-1")}>{label}</span>
      <span className={cn(SENSITIVE, "shrink-0 tabular-nums")}>{value}</span>
    </li>
  );
}

// A row the student edits in place (709:1548): the label and a quiet line
// under it, and the amount in a white box with a 35% Amethyst edge that is the
// field itself. Saved when the field loses focus or on Enter.
export function EditRow({
  id,
  label,
  sub,
  fieldLabel,
  value,
  invalid,
  error,
  pending,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  sub?: string | null;
  // What a screen reader hears for the field: "Rent each month".
  fieldLabel: string;
  value: string;
  invalid: boolean;
  error?: string | null;
  pending?: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const errorId = `${id}-error`;
  return (
    <li className="flex flex-col border-b border-off-white">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-m text-indigo-black">{label}</span>
          {sub ? <span className="text-[13px] leading-[18px] text-indigo-black/70">{sub}</span> : null}
        </div>
        <label
          className={cn(
            SENSITIVE,
            "my-px flex shrink-0 cursor-text items-center rounded-[12px] border-[1.5px] bg-white px-3 py-1.5 text-body-m font-semibold text-navy focus-within:border-violet focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
            invalid ? "border-coral" : "border-violet/35",
            pending && "opacity-70",
          )}
        >
          <span aria-hidden="true">$</span>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            aria-label={fieldLabel}
            aria-invalid={invalid || undefined}
            aria-describedby={error ? errorId : undefined}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            // As wide as what is typed, so the box hugs the number as in the frame.
            style={{ width: `${Math.max(1, value.length) + 0.2}ch` }}
            className="min-w-[1ch] bg-transparent p-0 tabular-nums outline-none"
          />
        </label>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-2 pb-2 text-body-s text-indigo-black">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-coral" />
          <span>{error}</span>
        </p>
      ) : null}
    </li>
  );
}
