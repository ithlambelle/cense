import CircleInfo from "@gravity-ui/icons/CircleInfo";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { CardArt } from "@/components/cards/card-art";
import { BackLink } from "@/components/ui/app-header";
import { FitSignal } from "@/components/ui/fit-signal";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { FactChip } from "@/components/ui/fact-chip";
import { NoteLine } from "@/components/ui/note";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import {
  cardDisplayName,
  cardTypeLabel,
  ESTIMATE_DISCLAIMER,
  NO_CARD_FALLBACK,
  NOT_YET_NEXT_STEPS,
  RESULT_DISCLAIMER,
  RESULT_HEADLINES,
  WHY_TITLE,
  whyLines,
} from "@/lib/copy/results";
import { SENSITIVE } from "@/lib/analytics";
import { moneyAmount } from "@/lib/money";
import { quizProgress } from "@/lib/quiz/progress";
import type { ResultOption, ResultView } from "@/lib/results/compute";
import { cardPath, quizPath, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

// The result screen: the header from Figma 397:822 (Wireframes Prototyping
// page), the options from the proposal "Result / Three options" (371:10704).
// Everything shown comes from computeResult (rules v1.3); nothing here decides fit.
// `answered`: how many questions are answered, for a quiz not finished yet.
export function ResultsView({ view, answered = 0 }: { view: ResultView; answered?: number }) {
  if (view.kind === "quiz_unfinished") {
    // The same count and words as Home's quiz card (quizProgress).
    const progress = quizProgress(answered);
    return (
      <ResultLayout title="No card match yet" subtitle={`Answer ${progress.questions} to see one`}>
        <p className="text-body-m text-navy">
          We’ll show a card to start with and the reasons it fits what you told us.
        </p>
        <Link href={quizPath("results")} className={cn(buttonVariants(), "mt-6")}>
          {progress.action}
          <ButtonChevron />
        </Link>
      </ResultLayout>
    );
  }

  if (view.kind === "no_card") {
    return (
      <ResultLayout title={RESULT_HEADLINES.not_yet} subtitle="Based on your answers" footer>
        <TrackOnMount event="recommendation_viewed" props={{ tier: "not_yet", card_id: null, option_count: 0 }} />
        <div className="rounded-card bg-off-white p-5">
          <p className={cn(SENSITIVE, "text-body-m text-navy")}>{view.reason ?? NO_CARD_FALLBACK}</p>
        </div>
        {/* No frame for this: built as "While you wait" on Still waiting, the
            bordered box with a violet-dot list. */}
        <section aria-labelledby="not-yet-next" className="mt-4 flex flex-col gap-3 rounded-card border border-hairline p-5">
          <h2 id="not-yet-next" className="font-heading text-h6 font-medium text-navy">
            {NOT_YET_NEXT_STEPS.title}
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body-s text-indigo-black marker:text-violet">
            <li>{NOT_YET_NEXT_STEPS.authorizedUser}</li>
            {/* Only when the reason was income: otherwise more income is not the answer. */}
            {view.ruleId ? (
              <li>
                {NOT_YET_NEXT_STEPS.ownIncome}
                {/* A 44px tap area around the 17px line: 14px each way
                    (after:-inset-3.5), kept on one line so it stays one box. */}
                <Link
                  href={quizPath("results")}
                  className="relative whitespace-nowrap text-violet underline underline-offset-2 after:absolute after:-inset-3.5 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {NOT_YET_NEXT_STEPS.ownIncomeLink}
                </Link>
                .
              </li>
            ) : null}
          </ul>
        </section>
      </ResultLayout>
    );
  }

  const [top, ...others] = view.options;
  const estimated = view.options.some((option) => whyLines(option).some((line) => line.id === "value"));

  return (
    <ResultLayout title={RESULT_HEADLINES[top.fit.tier]} subtitle="Based on your answers" footer>
      <TrackOnMount
        event="recommendation_viewed"
        props={{ tier: top.fit.tier, card_id: top.card.id, option_count: view.options.length }}
      />
      <section aria-labelledby="top-match" className="flex flex-col gap-3">
        <h2 id="top-match" className="font-heading text-h6 font-medium text-indigo-black">
          Top match
        </h2>
        <OptionCard option={top} top />
      </section>

      {others.length > 0 ? (
        <section aria-labelledby="other-options" className="mt-6 flex flex-col gap-3">
          <h2 id="other-options" className="font-heading text-h6 font-medium text-indigo-black">
            Other options
          </h2>
          {others.map((option) => (
            <OptionCard key={option.card.id} option={option} />
          ))}
        </section>
      ) : null}

      {estimated ? <p className="mt-4 text-body-s text-indigo-black/65">{ESTIMATE_DISCLAIMER}</p> : null}
    </ResultLayout>
  );
}

// One card on the result, from "Result / Three options" (Figma
// gPofkJWVZ2wUWyF9SfHW6O, 371:10704): the top match on off-white with a 1px
// Amethyst border, the others white with a 1.5px one, radius 22, 20/16
// padding, name with the fit signal. Added to the frame on Ben's direction
// (2026-11-07): the card art, "Why it's right for you" as up to three large
// lines in place of the frame's 13px ones, and the fee chips. The whole card
// opens the card page: in interviews a student waited instead of tapping View
// card (2026-10-18), so View card's box is stretched over the card
// (after:inset-0), the block-link pattern, one link rather than a link
// wrapping all its text.
function OptionCard({ option, top = false }: { option: ResultOption; top?: boolean }) {
  const { card, fit, rewards } = option;
  const lines = whyLines(option);
  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-card border-violet px-5 py-4 transition-transform duration-200 motion-safe:has-[a:active]:scale-[0.99]",
        top ? "border bg-off-white" : "border-[1.5px] bg-white",
      )}
    >
      <div className="flex items-start gap-3">
        <CardArt src={rewards?.image ?? null} className="w-16" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-body-s text-indigo-black/65">{cardTypeLabel(card)}</p>
          <h3 className="font-heading text-h6 font-medium text-navy">{cardDisplayName(card)}</h3>
        </div>
        {/* The fit tier as the designers' signal bars (G8). The approval line
            below says it in words: nobody noticed the label in interviews. */}
        <FitSignal tier={fit.tier} className={SENSITIVE} />
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-body-s font-semibold text-indigo-black/70">{WHY_TITLE}</h4>
        {/* Every line restates the student's answers or spending. */}
        <ul className={cn(SENSITIVE, "flex flex-col gap-3")}>
          {lines.map((line) => (
            <li key={line.id} className="flex items-start gap-3">
              {/* The designers' green check for good news, an info mark for a caution. */}
              {line.mark === "check" ? (
                <Image src="/icons/fit-check.svg" alt="" width={14} height={11} className="mt-[7px] shrink-0" />
              ) : (
                <CircleInfo aria-hidden="true" width={14} height={14} className="mt-[5px] shrink-0 text-indigo-black" />
              )}
              <span className="flex flex-col gap-0.5">
                <span className="text-body-m font-medium text-navy">
                  <LineText text={line.text} amount={line.amount} />
                </span>
                {line.detail ? <span className="text-body-s text-indigo-black/70">{line.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {top ? fit.notes.map((note) => <NoteLine key={note.id}>{note.text}</NoteLine>) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <dl className="flex flex-wrap items-start gap-3">
          <FactChip label="Annual fee" value={moneyAmount(card.annualFeeCents)} />
          {card.secured && card.depositMinCents > 0 ? (
            <FactChip label="Deposit" value={`From ${moneyAmount(card.depositMinCents)}`} />
          ) : null}
        </dl>
        {/* translate-none: a pressed nudge would make the link the box its
            ::after is sized to, shrinking the card-wide tap area mid-tap. */}
        <Link
          href={cardPath(card.id, "results")}
          aria-label={`View card: ${cardDisplayName(card)}`}
          className={cn(
            buttonVariants({ variant: "secondary", size: null }),
            "-mr-2 gap-1 px-2 after:absolute after:inset-0 after:rounded-card motion-safe:active:translate-none",
          )}
        >
          View card
          <ButtonChevron />
        </Link>
      </div>
    </div>
  );
}

// The line's text with its amount in the number font ("About $48 in your first year").
function LineText({ text, amount }: { text: string; amount: string | null }) {
  const at = amount ? text.indexOf(amount) : -1;
  if (!amount || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="font-number font-medium">{amount}</span>
      {text.slice(at + amount.length)}
    </>
  );
}

type ResultLayoutProps = {
  title: string;
  subtitle: string;
  // Retake quiz and the disclaimer, at the end of the page (they scroll with it).
  footer?: boolean;
  children: ReactNode;
};

function ResultLayout({ title, subtitle, footer = false, children }: ResultLayoutProps) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <header className="relative z-0 bg-navy px-6 pt-8 pb-11 shadow-[0_4px_8px_11px_var(--color-navy)]">
          <HeaderStars />
          {/* Back goes Home. It used to open the quiz, which restarts from the
              first question once every answer is in, so students who tapped it
              lost their match (solution interviews, 2026-10-17). Changing an
              answer is "Retake quiz" at the end of the page. */}
          <div className="relative flex items-center">
            <BackLink href={ROUTES.home} label="Home" tone="light" />
          </div>
          <div className="relative flex flex-col gap-[5px]">
            <h1 className="font-heading text-h3 font-medium text-white">{title}</h1>
            <p className="text-body-s text-off-white/70">{subtitle}</p>
          </div>
        </header>

        <main className="stagger relative flex flex-1 flex-col px-6 pt-10">
          {children}
          {footer ? (
            <div className="mt-auto flex flex-col items-center gap-3 pt-10 pb-[max(1.3125rem,env(safe-area-inset-bottom))]">
              <Link
                href={quizPath("results")}
                className="min-h-11 content-center text-body-s text-violet underline underline-offset-2 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Retake quiz
              </Link>
              <p className="text-center text-caption text-indigo-black/65">{RESULT_DISCLAIMER}</p>
            </div>
          ) : null}
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
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
