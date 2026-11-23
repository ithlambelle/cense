import Image from "next/image";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { CardArt } from "@/components/cards/card-art";
import { IssuerActions } from "@/components/cards/issuer-actions";
import { Accordion, AccordionSection } from "@/components/ui/accordion";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { FitSignal } from "@/components/ui/fit-signal";
import { StatusPill } from "@/components/ui/status-pill";
import { SENSITIVE } from "@/lib/analytics";
import type { Application, ApplicationDetail } from "@/lib/api/application";
import type { Card } from "@/lib/cards/catalog";
import type { CardRewards } from "@/lib/cards/rewards";
import { depositLine } from "@/lib/cards/deposit";
import {
  autopayLines,
  autopaySummary,
  dateLines,
  datesSummary,
  estimateShort,
  feeLines,
  feesSummary,
  issuerRulesSummary,
  rewardsSummary,
  SECTION_TITLES,
  spendLimitLines,
  spendLimitSummary,
  whyItFits,
} from "@/lib/copy/card-details";
import { cardDisplayName, ESTIMATE_DISCLAIMER, rateAmount, valueLine, type WhyLine } from "@/lib/copy/results";
import type { ReminderStatus } from "@/lib/home/state";
import {
  applicationPath,
  autopayOnPath,
  autopayStepsPath,
  cardBackLink,
  cardOrigin,
  paymentRemindersPath,
  spendLimitPath,
  type CardOrigin,
} from "@/lib/routes";
import type { YearOneEstimate } from "@/lib/results/value";
import { cardNotes, type CardFit } from "@/lib/rules/fit-tier";
import { cn } from "@/lib/utils";

// A card's page, in sections (Flow 2, Figma gPofkJWVZ2wUWyF9SfHW6O 821:8740;
// Steven, Nov 9: use an accordion). Two forms of one page:
// - K2 "Your match" (821:8793), a card the student does not have: the name,
//   the fit row, Why it fits you (open first), What the issuer looks for,
//   Rewards, and Fees and rates, then the issuer buttons at the bottom in the
//   order Your match uses: preapproval first (primary), then Apply.
// - K1 "Your card" (821:8748), a card the student tracks: the name, the card
//   row with its status, then for an approved card Your dates (open first),
//   Autopay and reminders, Spend limit, Rewards, and Fees and rates. An
//   applied or denied card shows what the issuer looks for, Rewards and Fees.
//   Update status opens Mark result for any of them.
// The issuer's own card art (James, Oct 26) is in K1's card row; K2's frame
// draws none. The page is open to everyone: a signed-out visitor sees K2
// without the fit row, and an issuer button sends them to sign in.
export function CardDetailView({
  card,
  signedIn,
  from,
  tracked = null,
  detail = null,
  reminders = null,
  rewards = null,
  estimate = null,
  fit = null,
}: {
  card: Card;
  signedIn: boolean;
  from?: string | string[];
  // The student's tracked application for this card, if any.
  tracked?: Application | null;
  // For an approved tracked card: its dates, autopay and spend limit.
  detail?: ApplicationDetail | null;
  // For an approved tracked card: its payment reminders.
  reminders?: ReminderStatus | null;
  // What the card earns (lib/cards/rewards.ts), null for a card with no data.
  rewards?: CardRewards | null;
  // The signed-in student's year-one estimate for this card, from their saved
  // spending answer (lib/results/value.ts). Null without one.
  estimate?: YearOneEstimate | null;
  // How the card fits the signed-in student's quiz answers (lib/rules), the
  // same tier and reasons Your match shows. Null without a finished quiz.
  fit?: CardFit | null;
}) {
  const back = cardBackLink(from);
  const yours = signedIn ? tracked : null;
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={back.href} backLabel={back.label} />
        {/* Content (K1 821:8758, K2 821:8803): 24px sides, 12 above, 12 between, 24 below. */}
        <main className="stagger flex flex-1 flex-col gap-3 px-6 pt-3 pb-6">
          {/* Sora 28/36. The frames say SemiBold; the app loads Sora Medium only
              (the typography frame: Medium is the heaviest heading weight). */}
          <h1 key="name" className="font-heading text-h2 font-medium text-navy">
            {cardDisplayName(card)}
          </h1>
          {yours
            ? [
                <StatusRow key="status" application={yours} image={rewards?.image ?? null} />,
                <YourCardSections
                  key="your-card"
                  card={card}
                  application={yours}
                  detail={detail}
                  reminders={reminders}
                  rewards={rewards}
                  estimate={estimate}
                  from={cardOrigin(from)}
                />,
                <Link key="update" href={applicationPath(yours.id, "card")} className={cn(TEXT_ACTION, "-mx-3 self-start")}>
                  Update status
                </Link>,
              ]
            : [
                signedIn ? <FitRow key="fit" fit={fit} estimate={estimate} /> : null,
                <MatchSections key="match" card={card} rewards={rewards} estimate={estimate} fit={signedIn ? fit : null} />,
              ]}
          {/* The frames' spacer: the buttons sit at the bottom of a short page. */}
          <div key="spacer" aria-hidden="true" className="flex-1" />
          {/* Keyed and always here, so "Did you finish applying?" and "Saved as
              applied" stay up when the save makes the card tracked (K1). */}
          <IssuerActions
            key="issuer-actions"
            card={{
              id: card.id,
              brand: card.brand,
              name: card.name,
              preapprovalUrl: card.preapprovalUrl,
              referralDisclosure: card.referralDisclosure,
            }}
            signedIn={signedIn}
            tracked={yours !== null}
          />
        </main>
        {signedIn ? (
          <div className="sticky bottom-0">
            <BottomNav />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// The Design System's Text button (371:2836): Inter Semi Bold 15, Amethyst,
// a pill that tints on press, 44px tall to tap.
const TEXT_ACTION =
  "inline-flex min-h-11 items-center rounded-pill px-3 text-button-s font-semibold text-violet hover:bg-violet/10 active:bg-violet/10 active:text-violet/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// A section's Text buttons in a row (wrapping on a narrow phone), pulled left
// by their own padding so the first label lines up with the text above it.
function Actions({ children }: { children: ReactNode }) {
  return <div className="-mx-3 flex flex-wrap">{children}</div>;
}

// One section and the value its Accordion knows it by.
type Section = { value: string; node: ReactElement };

// The sections that apply, the first of them open on arrival.
function Sections({ sections }: { sections: (Section | null)[] }) {
  const shown = sections.filter((section): section is Section => section !== null);
  return <Accordion defaultOpen={shown[0]?.value ?? null}>{shown.map((section) => section.node)}</Accordion>;
}

// A section's lines, one fact a line ("Statement closes · Day 18").
function Lines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="self-stretch">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

// A section's body: its lines, then the links that change them.
function Body({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-start">{children}</div>;
}

// K2's fit row (821:8805): the Fit meter, then the year-one estimate in Inter
// Medium 14 at 70%. The meter only for a likely fit or a stretch, as on Your match.
function FitRow({ fit, estimate }: { fit: CardFit | null; estimate: YearOneEstimate | null }) {
  const tier = fit && fit.tier !== "not_yet" ? fit.tier : null;
  const value = estimateShort(estimate);
  if (!tier && !value) return null;
  return (
    // Restates the student's answers: masked from session replay.
    <div className={cn(SENSITIVE, "flex flex-wrap items-center gap-x-3 gap-y-1")}>
      {tier ? <FitSignal tier={tier} /> : null}
      {value ? <p className="text-body-s leading-[normal] font-medium text-indigo-black/70">{value}</p> : null}
    </div>
  );
}

// K2's sections. Why it fits you opens first; without a fit (signed out, no
// quiz, or a card that is not a fit yet) the first section there opens.
function MatchSections({
  card,
  rewards,
  estimate,
  fit,
}: {
  card: Card;
  rewards: CardRewards | null;
  estimate: YearOneEstimate | null;
  fit: CardFit | null;
}) {
  const why = whyItFits(fit, rewards, estimate);
  const whySection: Section | null = why
    ? {
        value: "why",
        node: (
          <AccordionSection key="why" value="why" title={SECTION_TITLES.why} summary={why.summary} sensitive={SENSITIVE}>
            <ul>
              {why.lines.map((line) => (
                <WhyItem key={line.id} line={line} />
              ))}
            </ul>
          </AccordionSection>
        ),
      }
    : null;
  return <Sections sections={[whySection, issuerSection(card), rewardsSection(rewards, estimate), feesSection(card)]} />;
}

function WhyItem({ line }: { line: WhyLine }) {
  return (
    <li>
      <LineText text={line.text} amount={line.amount} />
      {line.detail ? <span className="block text-[13px] leading-5 text-indigo-black/70">{line.detail}</span> : null}
    </li>
  );
}

// The line's text with its amount in the number font, as on Your match.
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

// What the issuer looks for: every approval rule the issuer publishes, then
// the rules' card notes (N1, N2), which Your match shows as well.
function issuerSection(card: Card): Section | null {
  const rules = card.conditions.filter((condition) => condition.affects === "approval");
  const notes = cardNotes(card);
  if (rules.length === 0 && notes.length === 0) return null;
  return {
    value: "issuer",
    node: (
      <AccordionSection key="issuer" value="issuer" title={SECTION_TITLES.issuer} summary={issuerRulesSummary(card.brand)}>
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule.kind}>{rule.text}</li>
          ))}
          {notes.map((note) => (
            <li key={note.id}>{note.text}</li>
          ))}
        </ul>
      </AccordionSection>
    ),
  };
}

// Rewards: the student's year-one estimate when they answered spending, each
// rate in the issuer's words, and the sign-up bonus.
function rewardsSection(rewards: CardRewards | null, estimate: YearOneEstimate | null): Section | null {
  if (!rewards) return null;
  const yearOne = valueLine(estimate);
  return {
    value: "rewards",
    node: (
      <AccordionSection key="rewards" value="rewards" title={SECTION_TITLES.rewards} summary={rewardsSummary(rewards)}>
        <div className="flex flex-col gap-3">
          {yearOne ? (
            // Restates the student's spending: masked from session replay.
            <div className={SENSITIVE}>
              <p className="font-medium text-navy">
                <LineText text={yearOne.text} amount={yearOne.amount} />
              </p>
              <p className="text-indigo-black/70">{yearOne.detail}</p>
              <p className="text-caption text-indigo-black/65">{ESTIMATE_DISCLAIMER}</p>
            </div>
          ) : null}
          {rewards.rates.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {rewards.rates.map((rate) => (
                <li key={`${rate.amount}-${rate.category}`} className="flex items-start gap-3">
                  <span className="w-12 shrink-0 font-number text-number-m font-medium text-indigo-black">{rateAmount(rate)}</span>
                  <span className="flex flex-col">
                    <span>{rate.category}</span>
                    {rate.condition ? <span className="text-[13px] leading-5 text-indigo-black/70">{rate.condition}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No rewards on purchases.</p>
          )}
          {rewards.bonus ? (
            <p>
              <span className="font-semibold">Sign-up bonus: </span>
              {rewards.bonus.summary}
            </p>
          ) : null}
        </div>
      </AccordionSection>
    ),
  };
}

// Fees and rates: the facts the page showed as chips, and what the deposit is.
function feesSection(card: Card): Section {
  const deposit = depositLine(card);
  return {
    value: "fees",
    node: (
      <AccordionSection key="fees" value="fees" title={SECTION_TITLES.fees} summary={feesSummary(card)}>
        <Lines lines={feeLines(card)} />
        {deposit ? <p className="mt-2 text-[13px] leading-5 text-indigo-black/70">{deposit}</p> : null}
      </AccordionSection>
    ),
  };
}

// K1's card row (821:8760): the issuer's art at the Card art size (56 wide)
// and the decision. Approved: the Card art's green check badge and the
// Decision label (371:3491). Not approved: the faded card and the label's red
// cross (371:3495). Applied: no decision yet, so the plain status pill.
function StatusRow({ application, image }: { application: Application; image: string | null }) {
  return (
    <section aria-label="Your status" className={cn(SENSITIVE, "flex min-h-[58px] items-center gap-3")}>
      <span className="relative shrink-0">
        <CardArt src={image} sizes="56px" className={cn("w-14", application.status === "rejected" && "opacity-40")} />
        {application.status === "approved" ? (
          <span
            aria-hidden="true"
            className="absolute -top-2 left-11 flex size-5 items-center justify-center rounded-pill border-2 border-white bg-green"
          >
            <span className="h-[8.25px] w-[10.5px] bg-white mask-[url(/icons/fit-check.svg)] mask-contain mask-center mask-no-repeat" />
          </span>
        ) : null}
      </span>
      {application.status === "applied" ? (
        <StatusPill>APPLIED</StatusPill>
      ) : (
        <p className="flex items-center gap-[5px] text-body-s font-semibold text-navy">
          <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
            {application.status === "approved" ? (
              <Image src="/icons/fit-check.svg" alt="" width={14} height={11} />
            ) : (
              <Image src="/icons/decision-cross.svg" alt="" width={16} height={16} />
            )}
          </span>
          {application.status === "approved" ? "Approved" : "Not approved"}
        </p>
      )}
    </section>
  );
}

// K1's sections for a card the student tracks.
function YourCardSections({
  card,
  application,
  detail,
  reminders,
  rewards,
  estimate,
  from,
}: {
  card: Card;
  application: Application;
  detail: ApplicationDetail | null;
  reminders: ReminderStatus | null;
  rewards: CardRewards | null;
  estimate: YearOneEstimate | null;
  // Where this card page was opened from, kept for the reminder screen's Back.
  from: CardOrigin | undefined;
}) {
  const sections =
    application.status === "approved" && detail
      ? [...approvedSections(detail, reminders ?? "not_set", from), rewardsSection(rewards, estimate), feesSection(card)]
      : [issuerSection(card), rewardsSection(rewards, estimate), feesSection(card)];
  return <Sections sections={sections} />;
}

// Your dates, Autopay and reminders, and Spend limit, from what the student
// saved. Each opens the screen that changes it: the payment reminder screen
// (statement and due day, and the emails), the issuer's autopay steps (or
// "Autopay is on") and the spend limit screens. Each opens with this page as
// its origin, so its Back and Save return here, as the page was opened.
function approvedSections(detail: ApplicationDetail, reminders: ReminderStatus, from: CardOrigin | undefined): Section[] {
  const remindersHref = paymentRemindersPath(detail.id, "card", from);
  const datesSet = detail.statementClosingDay !== null && detail.paymentDueDay !== null;
  const autopayOn = detail.autopayStatus === "on";
  return [
    {
      value: "dates",
      node: (
        <AccordionSection key="dates" value="dates" title={SECTION_TITLES.dates} summary={datesSummary(detail)} sensitive={SENSITIVE}>
          <Body>
            <Lines lines={dateLines(detail)} />
            <Actions>
              <Link href={remindersHref} className={TEXT_ACTION}>
                {datesSet ? "Change your dates" : "Add your dates"}
              </Link>
            </Actions>
          </Body>
        </AccordionSection>
      ),
    },
    {
      value: "autopay",
      node: (
        <AccordionSection
          key="autopay"
          value="autopay"
          title={SECTION_TITLES.autopay}
          summary={autopaySummary(detail, reminders)}
          sensitive={SENSITIVE}
        >
          <Body>
            <Lines lines={autopayLines(detail, reminders)} />
            <Actions>
              <Link href={autopayOn ? autopayOnPath(detail.id, "card", from) : autopayStepsPath(detail.id, "card", from)} className={TEXT_ACTION}>
                {autopayOn ? "See autopay" : "Turn on autopay"}
              </Link>
              <Link href={remindersHref} className={TEXT_ACTION}>
                {reminders === "not_set" ? "Choose your reminders" : "Change reminders"}
              </Link>
            </Actions>
          </Body>
        </AccordionSection>
      ),
    },
    {
      value: "spend-limit",
      node: (
        <AccordionSection
          key="spend-limit"
          value="spend-limit"
          title={SECTION_TITLES.spendLimit}
          summary={spendLimitSummary(detail)}
          sensitive={SENSITIVE}
        >
          <Body>
            <Lines lines={spendLimitLines(detail)} />
            <Actions>
              <Link href={spendLimitPath(detail.id, detail.creditLimitCents, "card", from)} className={TEXT_ACTION}>
                {detail.spendLimitCents === null ? "Set a spend limit" : "Change your limit"}
              </Link>
            </Actions>
          </Body>
        </AccordionSection>
      ),
    },
  ];
}
