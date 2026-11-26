"use client";

// Created with Claude Code (2026-11-13). The pieces both Your money tabs are
// built from (Figma 709:1520 Today, 709:1769 This month, 709:1865 Short):
// the designers' navy hero (371:13007), the two tabs, read-only rows, rows
// with an amount the student edits in place, and the total row.
import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";

import { SENSITIVE } from "@/lib/analytics";
import type { BillAnswer } from "@/lib/api-client/safe-to-spend";
import { YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { moneyAmount } from "@/lib/money";
import { yourMoneyPath, type YourMoneyTab } from "@/lib/routes";
import { cn } from "@/lib/utils";

// The navy hero: a label, the big number in Unbounded Bold 44 Light Blue, and
// one line under it (left and right). The number is the student's money, so it
// is masked in session replay. Home uses it too (D1, 709:1470): there `link`
// is the chevron at the top right (709:1480), whose tap area covers the card,
// `ariaLabel` keeps Home's region name, and `children` go under the line.
export function MoneyHero({
  label,
  amount,
  unit,
  left,
  right,
  link,
  ariaLabel,
  children,
}: {
  label: string;
  amount: ReactNode;
  // " a day" after the number, at 20px (709:1528)
  unit?: string;
  left: ReactNode;
  right?: ReactNode;
  link?: { href: string; label: string };
  ariaLabel?: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={ariaLabel ?? label.replace(/:$/, "")}
      className={cn("flex min-h-[150px] flex-col rounded-[28px] bg-navy px-[23px] pt-[22px] pb-[18px] text-white", link && "relative")}
    >
      {/* 36px tall with the number pulled up 7px in the frame (709:1526):
          29px here, so a label that wraps at 320 wide pushes the number down
          instead of running into it. */}
      {/* No Preview label on the number (Ben, 2026-11-14). */}
      <div className="flex min-h-[29px] items-start justify-between gap-3">
        <p className="text-body-m leading-[18px] font-semibold">{label}</p>
        {link ? (
          <Link
            href={link.href}
            aria-label={link.label}
            className="mr-px flex shrink-0 items-center rounded-sm after:absolute after:inset-0 after:rounded-[28px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-off-white"
          >
            {/* The frame's own chevron, 12 by 20 (709:1480). */}
            <Image src="/icons/open-detail-chevron.svg" alt="" width={12} height={20} />
          </Link>
        ) : null}
      </div>
      {/* 44px tall and pulled up 7px, as drawn (709:1473), so the line under
          it starts 13px below: "a day" is set solid so its smaller type does
          not make the line taller. A number too wide for the card wraps
          rather than running out of it. */}
      <p className={cn(SENSITIVE, "-mb-[7px] font-number text-[44px] leading-[44px] font-bold text-light-blue [overflow-wrap:anywhere]")}>
        {amount}
        {/* "a day" never splits over two lines at 320; it moves down whole. */}
        {unit ? (
          <span className="text-[20px] leading-none">
            {" "}
            <span className="whitespace-nowrap">{unit.trim()}</span>
          </span>
        ) : null}
      </p>
      <div className="flex items-start justify-between gap-3 pt-[13px] text-body-s leading-4">
        <p className="text-balance">{left}</p>
        {right ? <p className="shrink-0 text-right">{right}</p> : null}
      </div>
      {children}
    </section>
  );
}

// Lets the tabs switch in place (YourMoneyView). `select` returns false when
// the tab cannot open in place, and then the link loads the page.
export const MoneyTabsContext = createContext<{
  select: (tab: YourMoneyTab) => boolean;
  from: YourMoneyTab | null;
} | null>(null);

// The answers both tabs edit (YourMoneyView): what to show, the latest saved
// copy for a save to build on, a way to record a save, and the page's one
// save queue, so saves from either tab run one after another.
export type SavedAnswers = { bills: BillAnswer[]; setAsideCents: number };
export type SharedAnswers = {
  answers: SavedAnswers;
  latest: () => SavedAnswers;
  saved: (answers: SavedAnswers) => void;
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
};

// The two tabs (709:1535): an Off-white track, the open tab a white pill with
// a 35% Amethyst edge. Each is a link, so a reload keeps the tab; it replaces
// the history entry, so Back leaves Your money instead of swapping tabs. On
// the page the tap switches in place and the pill slides across from the tab
// the student left (Ben, Nov 15), none with reduced motion.
export function MoneyTabs({ active }: { active: YourMoneyTab }) {
  const tabs = useContext(MoneyTabsContext);
  const slide = tabs?.from && tabs.from !== active ? (active === "month" ? "tab-slide-right" : "tab-slide-left") : null;
  const tab = (key: YourMoneyTab, label: string) => {
    const open = key === active;
    return (
      <Link
        href={yourMoneyPath(key)}
        replace
        scroll={false}
        aria-current={open ? "page" : undefined}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (tabs?.select(key)) event.preventDefault();
        }}
        className={cn(
          "relative z-10 flex min-w-0 flex-1 items-center justify-center rounded-pill border-[1.5px] border-transparent py-2.5 text-body-s transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          open ? "font-semibold text-navy" : "font-medium text-indigo-black/70 hover:text-indigo-black",
        )}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label={YOUR_MONEY_COPY.title} className="relative flex gap-1 rounded-pill bg-off-white p-1">
      {/* The open pill, behind the open tab's words. */}
      <span
        aria-hidden="true"
        style={slide ? { animation: `${slide} 260ms cubic-bezier(0.22, 1, 0.36, 1)` } : undefined}
        className={cn(
          "absolute inset-y-1 w-[calc(50%-6px)] rounded-pill border-[1.5px] border-violet/35 bg-white motion-reduce:!animate-none",
          active === "today" ? "left-1" : "left-[calc(50%+2px)]",
        )}
      />
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
    <li className="flex items-center gap-3 border-b border-off-white py-2 text-body-m text-indigo-black [&:has(+[data-total])]:border-b-0">
      <span className="min-w-0 flex-1">{label}</span>
      <span className={cn(SENSITIVE, "shrink-0 tabular-nums")}>{value}</span>
    </li>
  );
}

// The total row (709:1566): a hairline above, Semi Bold.
export function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <li data-total className="flex items-center gap-3 border-t border-hairline py-2 text-body-m font-semibold text-indigo-black">
      <span className={cn(SENSITIVE, "min-w-0 flex-1")}>{label}</span>
      <span className={cn(SENSITIVE, "shrink-0 tabular-nums")}>{value}</span>
    </li>
  );
}

// An amount as its field shows it: thousands commas, cents only when not
// whole dollars. 180000 -> "1,800", 1250 -> "12.50". The parsers read it back.
export function amountInput(cents: number | null): string {
  return cents === null ? "" : moneyAmount(cents).slice(1);
}

// A row the student edits in place (709:1548): the label and a quiet line
// under it, and the amount in a white box with a 35% Amethyst edge that is the
// field itself. Saved when the field loses focus or on Enter. `action` sits
// just before the amount: This month's undo on a line the student typed.
export function EditRow({
  id,
  label,
  sub,
  fieldLabel,
  value,
  invalid,
  error,
  pending,
  action,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  // The quiet line under the label: text, or a link (the savings goal's).
  sub?: ReactNode;
  // What a screen reader hears for the field: "Rent each month".
  fieldLabel: string;
  value: string;
  invalid: boolean;
  error?: string | null;
  pending?: boolean;
  action?: ReactNode;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const errorId = `${id}-error`;
  // The whole row is masked in session replay: which bills a student pays
  // and their due days are theirs, like their amounts.
  return (
    <li className={cn(SENSITIVE, "flex flex-col border-b border-off-white [&:has(+[data-total])]:border-b-0")}>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-m text-indigo-black">{label}</span>
          {sub ? <span className="text-[13px] leading-[18px] text-indigo-black/70">{sub}</span> : null}
        </div>
        {action}
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
