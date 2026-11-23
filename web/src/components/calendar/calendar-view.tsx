"use client";

import Link from "next/link";
import { useState } from "react";

import { BottomNav } from "@/components/ui/bottom-nav";
import { ErrorMessage } from "@/components/ui/error-message";
import { ListRowText } from "@/components/ui/list-row";
import { NO_CAPTURE, SENSITIVE } from "@/lib/analytics";
import {
  type CalendarEntry,
  dayLabel,
  DOT_ORDER,
  type DotKind,
  dotsByDate,
  longDay,
  monthName,
  monthWeeks,
} from "@/lib/calendar/month";
import { cn } from "@/lib/utils";

// Created with Claude Code (2026-11-21). The Calendar (Figma C1, 821:9293),
// values from get_design_context. A tab root, so no back arrow (Ben, Nov 21),
// laid out like the Cards tab: the heading 32px from the top, 24px sides.
// The frame sets "November" in Sora SemiBold 28; Sora is loaded at Medium only
// (app/layout.tsx), so it is Medium here, as Home's headings are.

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

const DOT_CLASS: Record<DotKind, string> = { card: "bg-violet", bill: "bg-amber", money: "bg-green" };
const DOT_LABEL: Record<DotKind, string> = { card: "Card dates", bill: "Bills", money: "Money in" };

function Dot({ kind }: { kind: DotKind }) {
  return <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-pill", DOT_CLASS[kind])} />;
}

// One date as a List row (Divider, 371:3199, no chevron as drawn): "Tomorrow ·
// Payment due" over "Discover · autopay is on". It opens the same place as
// Home's Coming up. Every row names a card, a bill or an amount, so all are
// masked in session replay.
function EntryRow({ entry, today }: { entry: CalendarEntry; today: string }) {
  return (
    <li>
      <Link
        href={entry.href}
        className={cn(
          "flex items-center gap-3 border-b border-off-white py-3.5 hover:bg-off-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          SENSITIVE,
        )}
      >
        <ListRowText title={`${dayLabel(entry.date, today)} · ${entry.what}`} subtitle={entry.subtitle} />
      </Link>
    </li>
  );
}

// "No dates saved", never "nothing is due": Cense only knows the dates it has,
// and a student with no bank linked may still have rent.
function nothingOn(date: string, today: string): string {
  const label = dayLabel(date, today);
  if (label === "Today" || label === "Tomorrow") return `No dates saved for ${label.toLowerCase()}.`;
  return `No dates saved for ${label}.`;
}

export function CalendarView({
  today,
  entries,
  incomplete = false,
}: {
  today: string;
  entries: CalendarEntry[];
  // A read failed, so an empty day may not be empty.
  incomplete?: boolean;
}) {
  // A tapped day shows its own dates; tapping it again goes back to what is next.
  const [picked, setPicked] = useState<string | null>(null);
  const dots = dotsByDate(entries);
  const shown = picked ? entries.filter((entry) => entry.date === picked) : entries.filter((entry) => entry.date >= today);
  // Only the kinds on this month's calendar: a key for a dot that cannot appear
  // explains nothing (paychecks join once detected income is wired).
  const legend = DOT_ORDER.filter((kind) => entries.some((entry) => entry.dot === kind));

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <main className="flex flex-1 flex-col gap-3 px-6 pt-8 pb-4">
          <h1 className="font-heading text-h2 font-medium text-navy">{monthName(today)}</h1>
          <p className="text-[13px] leading-[normal] text-indigo-black/70">Every date that matters this month</p>

          {/* Below 356px the grid runs wider than the text so each day stays 44 wide. */}
          <div className="flex flex-col gap-1 max-[355px]:-mx-[18px]">
            <div aria-hidden="true" className="flex">
              {WEEKDAYS.map((letter, index) => (
                <span key={index} className="flex-1 text-center text-caption leading-[normal] font-semibold text-indigo-black/70">
                  {letter}
                </span>
              ))}
            </div>
            {/* A day's name says which kinds of dates it holds, so clicks on it are not captured. */}
            <div role="group" aria-label={`${monthName(today)} days`} className={cn(NO_CAPTURE, "flex flex-col")}>
              {monthWeeks(today).map((week, row) => (
                <div key={row} className="flex">
                  {week.map((date, column) => {
                    if (!date) return <span key={`blank-${column}`} className="flex-1" />;
                    const day = Number(date.slice(8));
                    const kinds = dots.get(date) ?? [];
                    const isToday = date === today;
                    const isPicked = date === picked;
                    const names = kinds.map((kind) => DOT_LABEL[kind]).join(", ");
                    return (
                      <button
                        key={date}
                        type="button"
                        aria-pressed={isPicked}
                        aria-label={`${isToday ? "Today, " : ""}${longDay(date)}${names ? `: ${names}` : ""}`}
                        aria-current={isToday ? "date" : undefined}
                        onClick={() => setPicked(isPicked ? null : date)}
                        className="group flex flex-1 flex-col items-center gap-[3px] py-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      >
                        <span
                          className={cn(
                            "flex size-8 items-center justify-center rounded-pill text-[15px] leading-[normal] motion-safe:transition-colors motion-safe:duration-200",
                            isPicked
                              ? "bg-violet font-semibold text-white"
                              : isToday
                                ? "font-semibold text-violet group-hover:bg-off-white"
                                : "font-medium text-navy group-hover:bg-off-white",
                          )}
                        >
                          {day}
                        </span>
                        <span className="flex h-1.5 w-5 items-center justify-center gap-px">
                          {kinds.map((kind) => (
                            <Dot key={kind} kind={kind} />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {legend.length > 0 ? (
            <ul aria-label="What the dots mean" className="flex gap-4">
              {legend.map((kind) => (
                <li key={kind} className="flex items-center gap-1.5 text-caption leading-[normal] text-indigo-black/70">
                  <Dot kind={kind} />
                  {DOT_LABEL[kind]}
                </li>
              ))}
            </ul>
          ) : null}

          {incomplete ? <ErrorMessage>Some dates didn’t load. Refresh to try again.</ErrorMessage> : null}

          <section aria-label={picked ? longDay(picked) : "What's next"} aria-live="polite">
            {shown.length > 0 ? (
              <ul className="flex flex-col">
                {shown.map((entry) => (
                  <EntryRow key={entry.key} entry={entry} today={today} />
                ))}
              </ul>
            ) : incomplete ? null : (
              <p className="py-3.5 text-body-s text-indigo-black/70">
                {picked ? nothingOn(picked, today) : "No more dates saved this month."}
              </p>
            )}
          </section>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
