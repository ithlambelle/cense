import CircleInfo from "@gravity-ui/icons/CircleInfo";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { FactChip } from "@/components/ui/fact-chip";
import { NoteLine } from "@/components/ui/note";
import {
  cardDisplayName,
  cardTypeLabel,
  moneyAmount,
  RESULT_DISCLAIMER,
  RESULT_HEADLINES,
  TIER_LABELS,
} from "@/lib/copy/results";
import type { ResultView } from "@/lib/results/compute";
import { cardPath, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const NO_CARD_FALLBACK = "None of the cards we list fits what you told us yet.";

// The result screen, drawn from Figma 397:822 (Wireframes Prototyping page).
// Everything shown comes from computeResult (rules v1.2); nothing here decides fit.
export function ResultsView({ view }: { view: ResultView }) {
  if (view.kind === "quiz_unfinished") {
    return (
      <ResultLayout title="No card match yet" subtitle="Answer six short questions to see one">
        <p className="text-body-m text-navy">
          We’ll show a card to start with and the reasons it fits what you told us.
        </p>
        <Link href={ROUTES.quiz} className={cn(buttonVariants(), "mt-6")}>
          Take the quiz
        </Link>
      </ResultLayout>
    );
  }

  if (view.kind === "no_card") {
    return (
      <ResultLayout title={RESULT_HEADLINES.not_yet} subtitle="Based on your answers" footer>
        <div className="rounded-card bg-off-white p-5">
          <p className="text-body-m text-navy">{view.reason ?? NO_CARD_FALLBACK}</p>
        </div>
      </ResultLayout>
    );
  }

  const { card, fit, alternative } = view;

  return (
    <ResultLayout title={RESULT_HEADLINES[fit.tier]} subtitle="Based on your answers" footer>
      <section aria-labelledby="top-match" className="flex flex-col gap-4">
        <h2 id="top-match" className="font-heading text-h6 font-medium text-indigo-black">
          Top match
        </h2>
        <div className="flex flex-col gap-4 rounded-card bg-off-white p-5">
          <div className="flex flex-col gap-[9px]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body-s text-indigo-black">{cardTypeLabel(card)}</p>
              <Image src="/icons/card-symbol.svg" alt="" width={24} height={18} />
            </div>
            <h3 className="font-heading text-h5 font-medium text-navy">{cardDisplayName(card)}</h3>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="font-heading text-h6 font-medium text-navy">
              {fit.tier === "likely_fit" ? "Why it fits you" : "What to know"}
            </h4>
            <ul className="flex flex-col gap-2">
              {fit.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-3 text-body-m text-navy">
                  {/* A green check only for a likely fit. A stretch's reasons are cautions. */}
                  {fit.tier === "likely_fit" ? (
                    <Image src="/icons/fit-check.svg" alt="" width={14} height={11} className="mt-1.5 shrink-0" />
                  ) : (
                    <CircleInfo aria-hidden="true" width={14} height={14} className="mt-[5px] shrink-0 text-indigo-black" />
                  )}
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            {fit.notes.map((note) => (
              <NoteLine key={note.id}>{note.text}</NoteLine>
            ))}
          </div>

          <dl className="flex items-start justify-between gap-3">
            <FactChip label="Annual fee" value={moneyAmount(card.annualFeeCents)} />
            {card.secured && card.depositMinCents > 0 ? (
              <FactChip label="Deposit" value={`From ${moneyAmount(card.depositMinCents)}`} />
            ) : null}
          </dl>

          <Link href={cardPath(card.id)} className={buttonVariants()}>
            View card
          </Link>
        </div>
      </section>

      {alternative ? (
        <section aria-labelledby="another-option" className="mt-6 flex flex-col gap-4">
          <h2 id="another-option" className="font-heading text-h6 font-medium text-indigo-black">
            Another option
          </h2>
          {/* Its own tier and first reason, so a stretch never reads as an equal pick. */}
          <Link
            href={cardPath(alternative.card.id)}
            className="flex flex-col gap-1 rounded-card border-[1.5px] border-violet bg-white p-5 outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="font-heading text-h6 font-medium text-navy">{cardDisplayName(alternative.card)}</span>
              <span className="shrink-0 text-body-s font-semibold text-indigo-black">
                {TIER_LABELS[alternative.fit.tier]}
              </span>
            </span>
            <span className="text-body-s text-indigo-black">{cardTypeLabel(alternative.card)}</span>
            {alternative.fit.reasons[0] ? (
              <span className="text-body-s text-navy">{alternative.fit.reasons[0]}</span>
            ) : null}
          </Link>
        </section>
      ) : null}
    </ResultLayout>
  );
}

type ResultLayoutProps = {
  title: string;
  subtitle: string;
  // Retake quiz and the disclaimer, at the end of the page (they scroll with it).
  footer?: boolean;
  children: ReactNode;
};

const headerControl =
  "flex size-12 items-center justify-center rounded-pill outline-none hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-off-white";

function ResultLayout({ title, subtitle, footer = false, children }: ResultLayoutProps) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <header className="relative z-0 bg-navy px-6 pt-8 pb-11 shadow-[0_4px_8px_11px_var(--color-navy)]">
          <HeaderStars />
          <nav aria-label="Result" className="relative flex items-center justify-between">
            <Link href={ROUTES.quiz} aria-label="Back to the questions" className={headerControl}>
              <Image src="/icons/arrow-left.svg" alt="" width={48} height={48} />
            </Link>
            <Link href={ROUTES.home} aria-label="Close" className={headerControl}>
              <Image src="/icons/xmark.svg" alt="" width={48} height={48} />
            </Link>
          </nav>
          <div className="relative flex flex-col gap-[5px]">
            <h1 className="font-heading text-h3 font-medium text-white">{title}</h1>
            <p className="text-body-s text-off-white/70">{subtitle}</p>
          </div>
        </header>

        <main className="relative flex flex-1 flex-col px-6 pt-10">
          {children}
          {footer ? (
            <div className="mt-auto flex flex-col items-center gap-3 pt-10 pb-[max(1.3125rem,env(safe-area-inset-bottom))]">
              <Link
                href={ROUTES.quiz}
                className="min-h-11 content-center text-body-s text-violet underline underline-offset-2 outline-none hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Retake quiz
              </Link>
              <p className="text-center text-caption text-indigo-black/65">{RESULT_DISCLAIMER}</p>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

// The stars and dots in the header, placed as in the frame (390 wide).
// Left positions are percentages so they stay put on narrower phones.
function HeaderStars() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <Image
        src="/decor/star-large.svg"
        alt=""
        width={23}
        height={22}
        className="absolute top-[18px] left-[29%] rotate-[17.75deg]"
      />
      <Image
        src="/decor/star-large.svg"
        alt=""
        width={23}
        height={22}
        className="absolute top-[129px] left-[85.4%] rotate-[17.75deg]"
      />
      <Image
        src="/decor/star-small.svg"
        alt=""
        width={14}
        height={14}
        className="absolute top-[157px] left-[80.8%] -rotate-[14.09deg]"
      />
      <Image src="/decor/dot.svg" alt="" width={4} height={4} className="absolute top-[139px] left-[73.3%]" />
      <Image src="/decor/dot.svg" alt="" width={4} height={4} className="absolute top-[76px] left-[96.2%]" />
      <Image src="/decor/dot.svg" alt="" width={4} height={4} className="absolute top-[163px] left-[9.5%]" />
    </div>
  );
}
