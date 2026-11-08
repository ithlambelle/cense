import Bell from "@gravity-ui/icons/Bell";
import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogOutButton } from "@/components/account/log-out-button";
import { AppHeader } from "@/components/ui/app-header";
import { CardArt } from "@/components/ui/card-art";
import { STATUS_LABELS } from "@/lib/copy/applications";
import { SENSITIVE } from "@/lib/analytics";
import type { Application } from "@/lib/api/application";
import { moneyAmount } from "@/lib/money";
import type { ProfileUpdates } from "@/lib/profile-updates";
import { QUIZ_RETAKE, quizProgress } from "@/lib/quiz/progress";
import type { ResultView } from "@/lib/results/compute";
import { fromAccount, quizPath, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

// Profile (Flow F, F5, Figma 477:2797): Updates (count and the latest one),
// Your card, the Account rows, then Log out as a full-width outlined button
// with Switch account under it. Plain List rows, Divider style (371:3100).
// The frame draws no bottom bar. Accounts opens the linked bank and shows only
// once one is linked (F5 note). Every screen opened from here has a back arrow
// that returns here (F6 decided).
export function AccountView({
  email,
  card,
  quizAnswered = 0,
  quizResult = "quiz_unfinished",
  updates = null,
  bankLinked = false,
}: {
  email: string | null;
  card: Application | null;
  // How many quiz questions are answered, and what Results shows for them.
  quizAnswered?: number;
  quizResult?: ResultView["kind"];
  // The sent reminder emails as updates; null when they could not be read.
  updates?: ProfileUpdates | null;
  bankLinked?: boolean;
}) {
  const initial = email?.trim()[0]?.toUpperCase() ?? "?";
  // With no card tracked: the quiz in Home's words. Unfinished: Start or
  // Continue the quiz. Done: the result first ("See your match", or "See why"
  // when no card fits), and a retake second.
  const done = quizResult !== "quiz_unfinished";
  const quiz = { href: quizPath("account"), label: done ? QUIZ_RETAKE : quizProgress(quizAnswered).action };
  const result = { href: ROUTES.results, label: quizResult === "match" ? "See your match" : "See why" };
  const rows = [
    { href: fromAccount(ROUTES.cards), label: "Cards" },
    { href: fromAccount(ROUTES.addCard), label: "Add a card I already have" },
    ...(bankLinked ? [{ href: ROUTES.safeToSpend, label: "Accounts" }] : []),
    { href: ROUTES.reminderSettings, label: "Reminder settings" },
    { href: ROUTES.privacy, label: "Security and privacy" },
  ];
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="stagger flex flex-1 flex-col gap-2 px-6 pt-3 pb-6">
          <div className="flex items-center gap-4">
            {/* Avatar, Profile, Large (371:3342). */}
            <div
              aria-hidden="true"
              className={`${SENSITIVE} flex size-16 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-violet bg-light-blue/50 font-heading text-[24px] font-bold text-indigo-black`}
            >
              {initial}
            </div>
            <div className="flex min-w-0 flex-col">
              <h1 className="font-heading text-h5 font-semibold text-navy">Your account</h1>
              {email ? <p className={`truncate text-body-s text-indigo-black/70 ${SENSITIVE}`}>{email}</p> : null}
            </div>
          </div>

          {updates?.latest ? <UpdatesSection updates={updates} /> : null}

          <section aria-labelledby="your-card" className="flex flex-col gap-2">
          <SectionHeading id="your-card">Your card</SectionHeading>
          {card ? (
            <Link href={ROUTES.home} className={ROW}>
              <CardArt />
              <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
                <span className="text-body-m leading-[normal] font-medium text-indigo-black">
                  {card.cardName}
                </span>
                <span className={cn("text-body-s leading-[normal] text-indigo-black/70", SENSITIVE)}>{cardLine(card)}</span>
              </span>
              <Chevron />
            </Link>
          ) : (
            // The way to a first card: the quiz, or its result once done.
            // Adding a card you already have is the Account row below.
            <div className="flex flex-col border-b border-off-white pt-3.5 pb-1">
              <p className="text-body-s text-indigo-black">No card tracked yet.</p>
              <div className="flex flex-wrap gap-x-5">
                {(done ? [result, quiz] : [quiz]).map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="min-h-11 content-center text-body-s text-violet underline underline-offset-2 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          </section>

          <SectionHeading id="account">Account</SectionHeading>
          <ul aria-labelledby="account" className="-mt-2 flex flex-col">
            {rows.map((row) => (
              <li key={row.label}>
                <Link href={row.href} className={ROW}>
                  <span className="min-w-0 flex-1 text-body-m leading-[normal] font-medium text-indigo-black">{row.label}</span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>

          <div className="h-4 shrink-0" />
          <LogOutButton />
        </main>
      </div>
    </div>
  );
}

// List row, Divider (371:3199): 14px above and below, a 1px off-white line.
const ROW =
  "flex items-center gap-3 border-b border-off-white py-3.5 hover:bg-off-white/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function Chevron() {
  return <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-indigo-black" />;
}

// Section headings (477:2809, 2813, 2815): Inter Semi Bold 16, Deep navy.
function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-body-m font-semibold text-navy">
      {children}
    </h2>
  );
}

// "$500 limit" for an approved card with a limit (477:2814), else its status.
function cardLine(card: Application): string {
  if (card.status === "approved" && card.creditLimitCents !== null) return `${moneyAmount(card.creditLimitCents)} limit`;
  return STATUS_LABELS[card.status];
}

// Updates heading (477:2807) and the latest Notification item (371:3411):
// unread is the off-white tile. See all waits for the Updates screen.
function UpdatesSection({ updates }: { updates: ProfileUpdates }) {
  const latest = updates.latest!;
  const unread = updates.newCount > 0;
  return (
    <section aria-labelledby="updates" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 id="updates" className="text-body-m font-semibold text-navy">
          Updates
        </h2>
        {unread ? <p className="text-[13px] leading-[18px] text-violet">{updates.newCount} new</p> : null}
      </div>
      <Link
        href={ROUTES.home}
        className={cn(
          "flex items-start gap-3.5 rounded-button p-4 leading-[normal] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          unread ? "bg-off-white" : "border border-hairline bg-white",
        )}
      >
        <Bell aria-hidden="true" width={20} height={20} className="shrink-0 text-violet" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-indigo-black">{latest.title}</span>
            <span className="shrink-0 text-[13px] text-indigo-black/70">{latest.when}</span>
          </span>
          <span className="text-body-s leading-[normal] text-indigo-black/70">{latest.body}</span>
        </span>
      </Link>
    </section>
  );
}
