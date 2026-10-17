import CircleCheck from "@gravity-ui/icons/CircleCheck";
import CircleInfo from "@gravity-ui/icons/CircleInfo";
import Comment from "@gravity-ui/icons/Comment";
import CreditCard from "@gravity-ui/icons/CreditCard";
import Hourglass from "@gravity-ui/icons/Hourglass";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { Greeting } from "@/components/home/greeting";
import { UpdatedLine } from "@/components/home/updated-line";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { findCard } from "@/lib/cards/catalog";
import { cardDisplayName, cardTypeLabel, NO_CARD_FALLBACK, RESULT_HEADLINES, TIER_LABELS } from "@/lib/copy/results";
import type { Application } from "@/lib/api/application";
import type { HomeState } from "@/lib/home/state";
import { moneyAmount } from "@/lib/money";
import { QUESTIONS } from "@/lib/quiz/questions";
import { applicationPath, cardPath, deniedPath, planPath, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Home for MVP1 (Ben, 2026-10-16): card status and the next step, built from
// "Home · rejected card" (Figma 224:2675). Only the rejected state is drawn;
// the others reuse its parts and are proposed to design.
export function HomeView({ state }: { state: HomeState }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <header className="flex h-14 items-center gap-3 px-6 pt-8 pb-0 box-content">
          <Link
            href={ROUTES.settings}
            aria-label="Your account"
            className="rounded-input outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Image src="/mascot/penny-avatar.png" alt="" width={40} height={40} className="rounded-input" />
          </Link>
          <p className="flex-1 text-right text-body-s text-indigo-black">Home</p>
        </header>
        <main className="stagger flex flex-1 flex-col gap-[18px] px-6 pt-4 pb-6">
          <HomeContent state={state} />
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

function HomeContent({ state }: { state: HomeState }) {
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
          pill={TIER_LABELS[fit.tier].toUpperCase()}
          preview={{ name: cardDisplayName(card), kind: previewKind(card) }}
          rows={[{ label: "Annual fee", value: moneyAmount(card.annualFeeCents) }]}
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
            action={{ href: cardPath(card.id), label: "View card" }}
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
  return (
    <>
      <Greeting subtitle={subtitleFor(primary)} />
      <TrackedCard application={primary} />
      <TrackedNextStep application={primary} />
      {others.length > 0 ? <OtherCards applications={others} /> : null}
    </>
  );
}

function subtitleFor(application: Application): string {
  if (application.status === "approved") return "Here’s your card and what to do first.";
  return "Here’s the latest on your first card application.";
}

const PILLS: Record<Application["status"], string> = {
  applied: "APPLIED",
  approved: "APPROVED",
  rejected: "REJECTED",
};

function previewKind(card: { secured: boolean; studentsOnly: boolean }): string {
  if (card.secured) return "SECURED";
  if (card.studentsOnly) return "STUDENT";
  return "CREDIT";
}

function TrackedCard({ application }: { application: Application }) {
  const card = application.cardId ? findCard(application.cardId) : undefined;
  const rows: Row[] =
    application.status === "approved"
      ? [
          {
            label: "Credit limit",
            value: application.creditLimitCents === null ? "Not added" : moneyAmount(application.creditLimitCents),
          },
          { label: "First-month card plan", value: "Not started" },
        ]
      : application.status === "rejected"
        ? [
            { label: "First-month card plan", value: "Not started" },
            { label: "Card reminders", value: "Off" },
          ]
        : [{ label: "Decision", value: "Waiting to hear back" }];

  return (
    <StatusCard
      title={application.cardName}
      subtitle={<UpdatedLine iso={application.statusUpdatedAt} />}
      pill={PILLS[application.status]}
      preview={{ name: application.cardName, kind: card ? previewKind(card) : "CREDIT" }}
      rows={rows}
    />
  );
}

function TrackedNextStep({ application }: { application: Application }) {
  if (application.status === "rejected") {
    return (
      <NextStep
        icon={Comment}
        title="A denial isn’t the end"
        body="Understand the reason and choose a calm next step."
        action={{ href: deniedPath("options", application.id), label: "I was denied" }}
      />
    );
  }
  if (application.status === "approved") {
    return (
      <NextStep
        icon={CircleCheck}
        title="Plan your first month"
        body="Three small steps help you start your card on the right foot."
        action={{ href: planPath(application.id), label: "See my first-month plan" }}
      />
    );
  }
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

// The glowing card on Home: name, status pill, card preview and detail rows.
function StatusCard({
  title,
  subtitle,
  pill,
  preview,
  rows,
}: {
  title: string;
  subtitle: ReactNode;
  pill: string;
  preview: { name: string; kind: string };
  rows: Row[];
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-glow-form">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] text-indigo-black">
          <h2 className="font-heading text-h6 font-medium">{title}</h2>
          <p className="text-body-s">{subtitle}</p>
        </div>
        <StatusPill>{pill}</StatusPill>
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
            <dd className="font-semibold text-navy">{row.value}</dd>
          </div>
        ))}
      </dl>
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
          <p className="text-body-s">{body}</p>
        </div>
      </div>
      <Link href={action.href} className={buttonVariants()}>
        {action.label}
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
      <Link href={ROUTES.quiz} className={cn(buttonVariants(), "mt-10")}>
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
                    : planPath(application.id)
              }
              className="flex items-center justify-between gap-3 rounded-card border border-hairline bg-white px-5 py-4 outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="min-w-0 truncate font-heading text-h6 font-medium text-navy">{application.cardName}</span>
              <StatusPill>{PILLS[application.status]}</StatusPill>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
