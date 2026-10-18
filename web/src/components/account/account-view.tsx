import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";

import { LogOutButton } from "@/components/account/log-out-button";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { STATUS_LABELS } from "@/lib/copy/applications";
import { SENSITIVE } from "@/lib/analytics";
import type { Application } from "@/lib/api/application";
import { moneyAmount } from "@/lib/money";
import { ROUTES } from "@/lib/routes";

// Your account (S28): the MVP1 subset of the Profile frame (416:342), in the
// system's colors (the frame is an earlier draft in other hexes). Updates,
// notification settings and security screens are not in MVP1.
export function AccountView({ email, card }: { email: string | null; card: Application | null }) {
  const initial = email?.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} title="Profile" />
        <main className="flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
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
                className="flex items-center gap-3.5 rounded-input border border-hairline p-4 outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
              <p className="rounded-input border border-hairline p-4 text-body-s text-indigo-black">
                No card tracked yet. Take the quiz or add a card you already have.
              </p>
            )}
          </section>

          <section aria-labelledby="account" className="flex flex-col gap-2.5">
            <h2 id="account" className="font-heading text-h6 font-medium text-indigo-black">
              Account
            </h2>
            <ul className="overflow-hidden rounded-input border border-hairline">
              {[
                { href: ROUTES.results, label: "Card quiz results" },
                { href: ROUTES.addCard, label: "Add a card I already have" },
                { href: ROUTES.cards, label: "Browse cards" },
              ].map((row, index) => (
                <li key={row.href} className={index > 0 ? "border-t border-hairline" : undefined}>
                  <Link
                    href={row.href}
                    className="flex min-h-[51px] items-center justify-between px-4 text-body-s text-navy outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
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
