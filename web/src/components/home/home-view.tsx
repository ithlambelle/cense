import ChevronRight from "@gravity-ui/icons/ChevronRight";
import CircleCheck from "@gravity-ui/icons/CircleCheck";
import CircleInfo from "@gravity-ui/icons/CircleInfo";
import Comment from "@gravity-ui/icons/Comment";
import CreditCard from "@gravity-ui/icons/CreditCard";
import Hourglass from "@gravity-ui/icons/Hourglass";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { ApprovalHeading, ApprovedCard, StarConfetti } from "@/components/home/approved-card";
import { DeniedCard } from "@/components/home/denied-card";
import { Greeting } from "@/components/home/greeting";
import { UpdatedLine } from "@/components/home/updated-line";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { FitSignal } from "@/components/ui/fit-signal";
import { StatusPill } from "@/components/ui/status-pill";
import { findCard } from "@/lib/cards/catalog";
import { cardDisplayName, cardTypeLabel, NO_CARD_FALLBACK, RESULT_HEADLINES } from "@/lib/copy/results";
import { SENSITIVE } from "@/lib/analytics";
import type { Application } from "@/lib/api/application";
import { celebrating, type CardDetail, type HomeState } from "@/lib/home/state";
import { moneyAmount } from "@/lib/money";
import { QUESTIONS } from "@/lib/quiz/questions";
import { applicationPath, cardPath, deniedPath, planPath, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Home for MVP1 (Ben, 2026-10-16): card status and the next step. The approved
// card follows Flow 1 (approved-card.tsx) and the denied card Flow 2
// (denied-card.tsx); the other states reuse the parts of "Home · rejected
// card" (Figma 224:2675) and are proposed to design.
// `initial` is the student's initial for the profile circle. `detail` is the
// leading card's denial reason and autopay, read on the server with it.
// `celebrateId` is the card Mark result just approved (?celebrate=),
// celebrated once. `sampleStars` is for the dev gallery only: the approved or
// denied card shows these stars and never calls the API (its sample card does
// not exist there).
export function HomeView({
  state,
  initial,
  detail = null,
  celebrateId = null,
  sampleStars,
}: {
  state: HomeState;
  initial: string;
  detail?: CardDetail | null;
  celebrateId?: string | null;
  sampleStars?: number;
}) {
  const celebrate = celebrating(state, celebrateId);
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="relative flex w-full max-w-phone flex-col overflow-x-clip">
        <header className="box-content flex h-11 items-center px-6 pt-[42px] pb-0.5">
          {/* The initial in a circle replaces the labeled Profile button (Flow 1 frames). */}
          <Link
            href={ROUTES.settings}
            aria-label="Profile"
            className="flex size-11 items-center justify-center rounded-pill border border-track bg-off-white font-heading text-[17px] font-medium text-navy outline-none transition-colors hover:bg-selected-outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Image src="/mascot/astro-pig/avatar.png" alt={initial} width={40} height={40} className="rounded-input" />
          </Link>
        </header>
        <main className="stagger flex flex-1 flex-col gap-[18px] px-6 pt-4 pb-6">
          <HomeContent state={state} detail={detail} celebrate={celebrate} sampleStars={sampleStars} />
        </main>
        {celebrate ? <StarConfetti /> : null}
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

function HomeContent({
  state,
  detail,
  celebrate,
  sampleStars,
}: {
  state: HomeState;
  detail: CardDetail | null;
  celebrate: boolean;
  sampleStars?: number;
}) {
  if (state.kind === "no_quiz") {
    return (
      <>
        <Greeting subtitle="Let’s find your first card." />
        <QuizPrompt started={state.started} />
        <Link
          href={ROUTES.addCard}
          className="min-h-11 content-center self-center text-body-s text-violet underline underline-offset-2 outline-none hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
        >
          I already have a card
        </Link>
      </>
    );
  }

  if (state.kind === "no_card") {
    return (
      <>
        <Greeting subtitle="Here’s where your card search stands." />
        <NextStep
          icon={Comment}
          title="No card fits yet"
          body={state.reason ?? NO_CARD_FALLBACK}
          action={{ href: ROUTES.results, label: "See why" }}
        />
      </>
    );
  }

  if (state.kind === "matched") {
    const { card, fit } = state.result;
    // The words follow the rules' tier (copy/results.ts), so a stretch is never
    // introduced as a sure match. A not yet card is never the pick. A stretch
    // always has at least one caution: the first is shown, the rest are on the result.
    const likely = fit.tier === "likely_fit";
    return (
      <>
        <Greeting subtitle={`${RESULT_HEADLINES[fit.tier]}.`} />
        <StatusCard
          title={cardDisplayName(card)}
          subtitle={cardTypeLabel(card)}
          badge={<FitSignal tier={fit.tier} className={SENSITIVE} />}
          preview={{ name: cardDisplayName(card), kind: previewKind(card) }}
          rows={[{ label: "Annual fee", value: moneyAmount(card.annualFeeCents) }]}
          link={{ href: ROUTES.results, label: "See your match" }}
        />
        {likely ? (
          <NextStep
            icon={CircleCheck}
            title={card.preapprovalUrl ? "Check before you apply" : "Ready when you are"}
            body={
              card.preapprovalUrl
                ? "See if the issuer preapproves you first. The issuer says checking does not affect your credit score."
                : "Read the card’s details, then apply on the issuer’s site when you’re ready."
            }
            action={{ href: cardPath(card.id, "home"), label: "View card" }}
          />
        ) : (
          <NextStep
            icon={CircleInfo}
            title="What to know"
            body={fit.reasons[0] ?? RESULT_HEADLINES[fit.tier]}
            action={{ href: ROUTES.results, label: "See why" }}
          />
        )}
      </>
    );
  }

  const { primary, others } = state;
  if (primary.status === "approved") {
    return (
      <>
        {celebrate ? <ApprovalHeading /> : <Greeting />}
        <ApprovedCard
          application={primary}
          autopayOn={detail?.autopayStatus === "on"}
          reminderDaysSaved={detail?.paymentDueDay != null}
          celebrate={celebrate}
          sampleStars={sampleStars}
        />
        {others.length > 0 ? <OtherCards applications={others} /> : null}
      </>
    );
  }
  if (primary.status === "rejected") {
    return (
      <>
        <Greeting />
        <DeniedCard
          application={primary}
          reason={detail?.denialReason ?? null}
          sampleStars={sampleStars}
        />
        {others.length > 0 ? <OtherCards applications={others} /> : null}
      </>
    );
  }
  return (
    <>
      <Greeting subtitle="Here’s the latest on your first card application." />
      <TrackedCard application={primary} />
      <TrackedNextStep application={primary} />
      {others.length > 0 ? <OtherCards applications={others} /> : null}
    </>
  );
}

const PILLS: Record<Application["status"], string> = {
  applied: "APPLIED",
  approved: "APPROVED",
  // Ben, 2026-10-23 (Flow 2 C9).
  rejected: "NOT APPROVED",
};

function previewKind(card: { secured: boolean; studentsOnly: boolean }): string {
  if (card.secured) return "SECURED";
  if (card.studentsOnly) return "STUDENT";
  return "CREDIT";
}

// An applied card, waiting on the issuer's decision.
function TrackedCard({ application }: { application: Application }) {
  const card = application.cardId ? findCard(application.cardId) : undefined;
  const rows: Row[] = [{ label: "Decision", value: "Waiting to hear back" }];

  return (
    <StatusCard
      title={application.cardName}
      subtitle={<UpdatedLine iso={application.statusUpdatedAt} />}
      badge={<StatusPill className={SENSITIVE}>{PILLS[application.status]}</StatusPill>}
      preview={{ name: application.cardName, kind: card ? previewKind(card) : "CREDIT" }}
      rows={rows}
      // A tracked card opens its card page (back returns Home). A card added
      // by hand that is not in the catalog has no page; its next step below
      // is the one action.
      link={card ? { href: cardPath(card.id, "home"), label: "View card details" } : undefined}
    />
  );
}

function TrackedNextStep({ application }: { application: Application }) {
  return (
    <NextStep
      icon={Hourglass}
      title="Did you hear back?"
      body="Tell us what the issuer decided and we’ll guide your next step."
      action={{ href: applicationPath(application.id), label: "Update my status" }}
    />
  );
}

type Row = { label: string; value: string };

// The glowing card on Home: name, fit or status, card preview and detail rows.
function StatusCard({
  title,
  subtitle,
  badge,
  preview,
  rows,
  link,
}: {
  title: string;
  subtitle: ReactNode;
  // The fit signal for a match, the status pill for an application (G8).
  badge: ReactNode;
  preview: { name: string; kind: string };
  rows: Row[];
  // Makes the whole card a link: in interviews students tapped the match card
  // on Home and nothing happened (2026-10-21).
  link?: { href: string; label: string };
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-col gap-3 rounded-card bg-white p-5 shadow-glow-form",
        link && "relative transition-transform duration-200 has-[a:hover]:bg-off-white/40 motion-safe:has-[a:active]:scale-[0.99]",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] text-indigo-black">
          <h2 className="font-heading text-h6 font-medium">{title}</h2>
          <p className="text-body-s">{subtitle}</p>
        </div>
        {badge}
      </div>
      <div aria-hidden="true" className="flex h-28 flex-col justify-between rounded-input bg-off-white p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="line-clamp-2 font-heading text-h6 font-medium text-navy">{preview.name}</p>
          <CreditCard width={22} height={22} className="shrink-0 text-violet" />
        </div>
        <div className="flex items-end justify-between text-indigo-black">
          <p className="font-number text-number-s whitespace-pre">{"••••  ••••  ••••"}</p>
          <p className="text-body-s">{preview.kind}</p>
        </div>
      </div>
      <div className="h-px bg-hairline" />
      <dl className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 text-body-s">
            <dt className="text-indigo-black">{row.label}</dt>
            <dd className={cn(SENSITIVE, "font-semibold text-navy")}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {link ? (
        // The link's box covers the whole card (after:inset-0), so a tap anywhere opens it.
        <Link
          href={link.href}
          className="flex min-h-11 items-center justify-between rounded-input text-body-s font-semibold text-violet outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
        >
          {link.label}
          <ChevronRight aria-hidden="true" width={16} height={16} />
        </Link>
      ) : null}
    </section>
  );
}

// The quiet card under the status card: an icon, a short title and line, and one action.
function NextStep({
  icon: IconComponent,
  title,
  body,
  action,
}: {
  icon: Icon;
  title: string;
  body: string;
  action: { href: string; label: string };
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card border border-hairline bg-white p-5">
      <div className="flex items-center gap-3">
        <IconComponent aria-hidden="true" width={22} height={22} className="shrink-0 text-violet" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-indigo-black">
          <h2 className="font-heading text-h6 font-medium">{title}</h2>
          {/* Can be a fit reason, which restates the student's answers. */}
          <p className={cn(SENSITIVE, "text-body-s")}>{body}</p>
        </div>
      </div>
      <Link href={action.href} className={buttonVariants()}>
        {action.label}
        <ButtonChevron />
      </Link>
    </section>
  );
}

// "6 questions to your first card" (Figma 407:442, drawn as a pop-up over the
// MVP2 home). Shown inline on the MVP1 home with the system's type.
function QuizPrompt({ started }: { started: boolean }) {
  return (
    <section aria-labelledby="quiz-prompt" className="flex flex-col rounded-card bg-off-white p-5">
      <ol aria-hidden="true" className="flex items-center gap-1.5">
        {QUESTIONS.map((question, index) => (
          <li
            key={question.field}
            className={cn(
              "flex size-[22px] items-center justify-center rounded-full",
              index === 0 ? "bg-navy" : "border-[1.5px] border-indigo-black/70",
            )}
          >
            {index === 0 ? <Image src="/decor/star-large.svg" alt="" width={13} height={12} /> : null}
          </li>
        ))}
      </ol>
      <h2 id="quiz-prompt" className="pt-6 font-heading text-h3 font-medium text-indigo-black">
        {QUESTIONS.length} questions to your first card
      </h2>
      <p className="pt-3 text-body-s text-indigo-black/70">
        Light up each star and we’ll match you with cards built for where you are.
      </p>
      <Link href={ROUTES.quiz} className={cn(buttonVariants({ chevron: false }), "mt-10")}>
        {started ? "Continue the quiz" : "Start the quiz"}
      </Link>
    </section>
  );
}

function OtherCards({ applications }: { applications: Application[] }) {
  return (
    <section aria-labelledby="other-cards" className="flex flex-col gap-3">
      <h2 id="other-cards" className="font-heading text-h6 font-medium text-indigo-black">
        Your other cards
      </h2>
      <ul className="flex flex-col gap-3">
        {applications.map((application) => (
          <li key={application.id}>
            <Link
              href={
                application.status === "applied"
                  ? applicationPath(application.id)
                  : application.status === "rejected"
                    ? deniedPath("options", application.id)
                    : // An approved card opens its own page (status and Update
                      // status). The old first-month page could not save autopay.
                      application.cardId
                      ? cardPath(application.cardId, "home")
                      : planPath(application.id)
              }
              className="flex items-center justify-between gap-3 rounded-card border border-hairline bg-white px-5 py-4 outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="min-w-0 truncate font-heading text-h6 font-medium text-navy">{application.cardName}</span>
              <StatusPill className={SENSITIVE}>{PILLS[application.status]}</StatusPill>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
