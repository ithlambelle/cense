import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";

import { LogOutButton } from "@/components/account/log-out-button";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { STATUS_LABELS } from "@/lib/copy/applications";
import { SENSITIVE } from "@/lib/analytics";
import type { Application } from "@/lib/api/application";
import { moneyAmount } from "@/lib/money";
import { QUIZ_RETAKE, quizProgress } from "@/lib/quiz/progress";
import type { ResultView } from "@/lib/results/compute";
import { quizPath, ROUTES } from "@/lib/routes";

// Your account (S28): the MVP1 subset of the Profile frame (416:342), in the
// system's colors (the frame is an earlier draft in other hexes). Updates,
// notification settings and security screens are not in MVP1.
export function AccountView({
  email,
  card,
  quizAnswered = 0,
  quizResult = "quiz_unfinished",
}: {
  email: string | null;
  card: Application | null;
  // How many quiz questions are answered, and what Results shows for them.
  quizAnswered?: number;
  quizResult?: ResultView["kind"];
}) {
  const initial = email?.trim()[0]?.toUpperCase() ?? "?";
  // The quiz in Home's words. Unfinished: Start or Continue the quiz, straight
  // to the quiz, since Results has nothing to show yet. Done: the result first
  // ("See your match", or "See why" when no card fits, as Home says), and a
  // retake second, which opens the quiz at question 1.
  const done = quizResult !== "quiz_unfinished";
  const quiz = { href: quizPath("account"), label: done ? QUIZ_RETAKE : quizProgress(quizAnswered).action };
  const result = { href: ROUTES.results, label: quizResult === "match" ? "See your match" : "See why" };
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex items-center gap-4">
            <div
              aria-hidden="true"
              className={`${SENSITIVE} flex size-[68px] shrink-0 items-center justify-center rounded-full border-2 border-violet bg-off-white font-heading text-h3 font-medium text-navy`}
            >
              {initial}
            </div>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <h1 className="font-heading text-h3 font-medium text-navy">Your account</h1>
              {email ? <p className={`truncate text-body-s text-indigo-black ${SENSITIVE}`}>{email}</p> : null}
            </div>
          </div>

          <section aria-labelledby="your-card" className="flex flex-col gap-2.5">
            <h2 id="your-card" className="font-heading text-h6 font-medium text-indigo-black">
              Your card
            </h2>
            {card ? (
              <Link
                href={ROUTES.home}
                className="flex items-center gap-3.5 rounded-input border border-hairline p-4 hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span aria-hidden="true" className="flex h-9 w-14 shrink-0 items-end rounded-[5px] bg-navy p-1.5">
                  <span className="h-2 w-3 rounded-[2px] bg-light-blue" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body-s font-semibold text-navy">{card.cardName}</span>
                  <span className={`text-caption text-indigo-black ${SENSITIVE}`}>
                    {STATUS_LABELS[card.status]}
                    {card.status === "approved" && card.creditLimitCents !== null ? `, ${moneyAmount(card.creditLimitCents)} limit` : ""}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-violet" />
              </Link>
            ) : (
              // The way to a first card: the quiz, or its result once done.
              // Adding a card you already have is the Account row below, so it
              // is not repeated here.
              <div className="flex flex-col rounded-input border border-hairline px-4 pt-4 pb-1">
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

          <section aria-labelledby="account" className="flex flex-col gap-2.5">
            <h2 id="account" className="font-heading text-h6 font-medium text-indigo-black">
              Account
            </h2>
            <ul className="overflow-hidden rounded-input border border-hairline">
              {[
                // With no card tracked the box above leads to the quiz or its
                // result, so this row is only for a student with a card.
                ...(card ? [done ? { href: ROUTES.results, label: "Card quiz results" } : quiz] : []),
                { href: ROUTES.addCard, label: "Add a card I already have" },
                { href: ROUTES.cards, label: "Browse cards" },
                { href: ROUTES.privacy, label: "Security and privacy" },
              ].map((row, index) => (
                <li key={row.href} className={index > 0 ? "border-t border-hairline" : undefined}>
                  <Link
                    href={row.href}
                    className="flex min-h-[51px] items-center justify-between px-4 text-body-s text-navy hover:bg-off-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    {row.label}
                    <ChevronRight aria-hidden="true" width={16} height={16} className="text-violet" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <LogOutButton />
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
