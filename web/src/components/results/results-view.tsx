import Image from "next/image";
import Link from "next/link";

import { BackLink } from "@/components/ui/back-link";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import { GlowCard } from "@/components/ui/glow-card";
import { Disclaimer, NoteLine } from "@/components/ui/note";
import { ScreenShell } from "@/components/ui/screen-shell";
import {
  annualFeeLine,
  cardDescription,
  cardTypeLabel,
  RESULT_DISCLAIMER,
  RESULT_HEADLINES,
} from "@/lib/copy/results";
import type { ResultView } from "@/lib/results/compute";
import { cardPath, ROUTES } from "@/lib/routes";

const NO_CARD_FALLBACK = "None of the cards we list fits what you told us yet.";

// The result screen, drawn from Figma 61:2851 "Result · Your starting point".
// Everything shown comes from computeResult (rules v1.2); nothing here decides fit.
// Where the light frame leaves text off-white on white, the system's muted text
// is used instead (flagged to design).
export function ResultsView({ view }: { view: ResultView }) {
  const nav = <BottomNav />;

  if (view.kind === "quiz_unfinished") {
    return (
      <ScreenShell nav={nav} footer={<Link href={ROUTES.quiz} className={buttonVariants()}>Take the quiz</Link>}>
        <h1 className="font-heading text-title font-bold">No card match yet</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Answer six short questions and we’ll show a card to start with, and the reason for it.
        </p>
      </ScreenShell>
    );
  }

  // In the page flow, not pinned: the guidance line is long enough that a
  // pinned footer would cover the result on a phone. Figma draws it at the end.
  const footer = (
    <div className="mt-auto flex flex-col gap-3 pt-10">
      <Link href={ROUTES.quiz} className={buttonVariants({ variant: "dark" })}>
        Retake quiz
      </Link>
      <Disclaimer>{RESULT_DISCLAIMER}</Disclaimer>
    </div>
  );

  if (view.kind === "no_card") {
    return (
      <ScreenShell nav={nav}>
        <BackLink href={ROUTES.quiz} className="-ml-3 self-start" />
        <h1 className="mt-4 font-heading text-title font-bold">Not quite yet</h1>
        <p className="mt-2 text-body text-muted-foreground">{view.reason ?? NO_CARD_FALLBACK}</p>
        {footer}
      </ScreenShell>
    );
  }

  const { card, fit, alternative } = view;
  const description = cardDescription(card);

  return (
    <ScreenShell nav={nav}>
      <BackLink href={ROUTES.quiz} className="-ml-3 self-start" />
      <h1 className="mt-4 font-heading text-title font-bold">{RESULT_HEADLINES[fit.tier]}</h1>

      <GlowCard purpose="result" className="mt-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-label text-muted-foreground">{cardTypeLabel(card)}</p>
            <Image src="/icons/card-symbol.svg" alt="" width={24} height={18} />
          </div>
          <h2 className="font-heading text-card-name font-semibold">{card.name}</h2>
          {description ? <p className="text-label text-muted-foreground">{description}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-heading text-section font-semibold">
            {fit.tier === "likely_fit" ? "Why it fits you" : "What to know"}
          </h3>
          <ul className="flex flex-col gap-2">
            {fit.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-3 text-body">
                <Image src="/icons/fit-check.svg" alt="" width={14} height={11} className="mt-[0.4rem] shrink-0" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          {fit.notes.map((note) => (
            <NoteLine key={note.id}>{note.text}</NoteLine>
          ))}
        </div>

        <NoteLine>
          {card.brand} · {annualFeeLine(card.annualFeeCents)}
        </NoteLine>

        <Link href={cardPath(card.id)} className={buttonVariants()}>
          Learn more
        </Link>
      </GlowCard>

      {alternative ? (
        <section className="mt-8 flex flex-col gap-3">
          <h2 className="font-heading text-section font-semibold text-muted-foreground">Another option</h2>
          <Link
            href={cardPath(alternative.id)}
            className="flex flex-col gap-1 rounded-card border-[1.5px] border-primary p-5 outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="font-heading text-section font-semibold">{alternative.name}</span>
            <span className="text-label text-muted-foreground">
              {cardTypeLabel(alternative)} · {annualFeeLine(alternative.annualFeeCents)}
            </span>
          </Link>
        </section>
      ) : null}

      {footer}
    </ScreenShell>
  );
}
