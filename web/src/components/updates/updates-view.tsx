"use client";

import Bell from "@gravity-ui/icons/Bell";
import Calendar from "@gravity-ui/icons/Calendar";
import CheckDouble from "@gravity-ui/icons/CheckDouble";
import File from "@gravity-ui/icons/File";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentType, type SVGProps } from "react";

import { ReminderArrival } from "@/components/home/reminder-arrival";
import { BackLink } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ErrorMessage } from "@/components/ui/error-message";
import { SENSITIVE, track } from "@/lib/analytics";
import { markAllRead, markPaid } from "@/lib/api-client/updates";
import type { UpdateGroup, UpdateIcon, UpdateItem } from "@/lib/reminders/in-app";
import { ROUTES, signInPath, type ReminderKind } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { SnoozeSheet, type SnoozeTarget } from "./snooze-sheet";

const ICONS: Record<UpdateIcon, ComponentType<SVGProps<SVGSVGElement>>> = { bell: Bell, file: File, calendar: Calendar };

const GROUPS: { key: UpdateGroup; label: string }[] = [
  { key: "new", label: "New" },
  { key: "snoozed", label: "Snoozed" },
  { key: "earlier", label: "Earlier" },
];

// Updates (Flow B N1, Figma 477:1236, the designers' Updates frame with three
// changes): each sent reminder is a card with its one action and a Snooze,
// grouped New, Snoozed and Earlier, and "Mark all read" in the header. Snooze
// opens the sheet (N2); a follow-up's title opens its own screen (N3).
// `fromReminder` is the kind of reminder email whose Open Cense opened it.
export function UpdatesView({
  groups,
  fromReminder = null,
}: {
  groups: Record<UpdateGroup, UpdateItem[]>;
  fromReminder?: ReminderKind | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<SnoozeTarget | null>(null);
  const empty = GROUPS.every(({ key }) => groups[key].length === 0);

  async function readAll() {
    if (busy) return;
    setBusy("read");
    setError(null);
    const result = await markAllRead();
    setBusy(null);
    if (result.kind === "ok") router.refresh();
    else if (result.kind === "signed-out") router.replace(signInPath(ROUTES.updates));
    else setError(result.message);
  }

  async function paid(item: UpdateItem) {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    const result = await markPaid(item.id);
    setBusy(null);
    if (result.kind === "ok") {
      track("reminder_payment_reported", { kind: item.kind, from: "updates" });
      router.refresh();
    } else if (result.kind === "signed-out") router.replace(signInPath(ROUTES.updates));
    else setError(result.message);
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <header className="box-content flex h-12 items-center justify-between gap-3 px-6 pt-8">
          <BackLink href={ROUTES.home} label="Home" />
          {groups.new.length > 0 ? (
            <button
              type="button"
              onClick={readAll}
              disabled={busy !== null}
              className="flex shrink-0 items-center gap-1.5 rounded-pill bg-light-blue py-2 pr-4 pl-3.5 text-body-s font-semibold text-indigo-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            >
              <CheckDouble aria-hidden="true" width={16} height={16} />
              Mark all read
            </button>
          ) : null}
        </header>
        <main className="flex flex-1 flex-col px-6 pb-6">
          <h1 className="sr-only">Updates</h1>
          {error ? <ErrorMessage className="pt-4">{error}</ErrorMessage> : null}
          {empty ? (
            <p className="pt-6 text-body-s text-indigo-black">No updates yet. A reminder shows here once its email goes out.</p>
          ) : null}
          {GROUPS.map(({ key, label }) =>
            groups[key].length > 0 ? (
              <section key={key} aria-labelledby={`updates-${key}`} className="flex flex-col gap-2.5 pt-6">
                <h2 id={`updates-${key}`} className="text-[13px] leading-[18px] text-indigo-black/70">
                  {label}
                </h2>
                <ul className="flex flex-col gap-3.5">
                  {groups[key].map((item) => (
                    <li key={item.id}>
                      <UpdateCard
                        item={item}
                        busy={busy === item.id}
                        disabled={busy !== null}
                        onPaid={() => paid(item)}
                        onSnooze={() => setSnoozing({ id: item.id, kind: item.kind, choices: item.snooze })}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </main>
        <SnoozeSheet target={snoozing} onClose={() => setSnoozing(null)} />
        {fromReminder ? <ReminderArrival kind={fromReminder} /> : null}
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

// One notification (477:1243): icon, title and time, one line, then the
// card's action and Snooze inside it.
function UpdateCard({
  item,
  busy,
  disabled,
  onPaid,
  onSnooze,
}: {
  item: UpdateItem;
  busy: boolean;
  disabled: boolean;
  onPaid: () => void;
  onSnooze: () => void;
}) {
  const Icon = ICONS[item.icon];
  const titleClass = "text-[14px] leading-normal font-semibold text-navy";
  return (
    <article aria-label={item.title} className="flex items-start gap-3 rounded-[20px] bg-off-white p-4">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-off-white text-violet">
        <Icon width={20} height={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {item.href ? (
            <Link href={item.href} className={cn(titleClass, "underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring")}>
              {item.title}
            </Link>
          ) : (
            <p className={titleClass}>{item.title}</p>
          )}
          <p className="shrink-0 text-[13px] leading-[18px] text-indigo-black/70">{item.time}</p>
        </div>
        <p className={cn("text-[14px] leading-[1.3] text-indigo-black/70", item.sensitive && SENSITIVE)}>{item.description}</p>
        {item.action || item.snooze.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {item.action?.type === "paid" ? (
              <button
                type="button"
                onClick={onPaid}
                disabled={disabled}
                aria-busy={busy || undefined}
                className={COMPACT_PRIMARY}
              >
                {item.action.label}
              </button>
            ) : item.action ? (
              <Link href={item.action.href} className={COMPACT_PRIMARY}>
                {item.action.label}
              </Link>
            ) : null}
            {item.snooze.length > 0 ? (
              <button
                type="button"
                onClick={onSnooze}
                disabled={disabled}
                aria-label={`Snooze ${item.title}`}
                className="flex h-10 items-center rounded-button text-button-s font-semibold text-violet hover:text-violet-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
              >
                Snooze
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

// Button / Compact (Figma 270:2130): 40 tall, filled violet. Corners are the
// system's 16 (pills retired, 2026-10-24); the frame draws 12.
const COMPACT_PRIMARY =
  "flex h-10 items-center rounded-button bg-violet pr-2.5 pl-3.5 text-button-s font-semibold text-white hover:bg-violet-hover active:bg-violet-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:bg-violet-disabled aria-busy:cursor-progress";
