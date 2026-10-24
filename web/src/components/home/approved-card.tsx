"use client";

import StarFill from "@gravity-ui/icons/StarFill";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SENSITIVE } from "@/lib/analytics";
import { loadPlanSteps, savePlanStep, type PlanStepName } from "@/lib/api-client/plans";
import type { Application } from "@/lib/api/application";
import { moneyAmount } from "@/lib/money";
import { applicationPath, CELEBRATE_PARAM, ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

// Home's approved card (Flow 1, Figma 144:1555, 144:1655, 144:1733): the card,
// its limit and the first month's three steps as stars in one module.

type StepKey = "autopay" | "plannedPurchase" | "paymentReminder";
type Lit = Record<StepKey, boolean>;

// Copy from the frames. Autopay is not a plan step: it is the card's own
// autopay status.
// TODO(#58): read and save autopay through autopayStatus on GET and PATCH
// /applications/{id} once #58 merges. Until then its star is kept on the page only.
const STEPS: { key: StepKey; step: PlanStepName | null; title: string; detail: string }[] = [
  { key: "autopay", step: null, title: "Turn on autopay", detail: "Statement balance, every month" },
  { key: "plannedPurchase", step: "planned_purchase", title: "Plan one purchase", detail: "A small cost you already budget for" },
  { key: "paymentReminder", step: "payment_reminder", title: "Set a payment reminder", detail: "Use the due date on your statement" },
];

const NONE_LIT: Lit = { autopay: false, plannedPurchase: false, paymentReminder: false };

// The burst star (public/decor/burst-star.svg, the frames' star shape) as a
// mask, so one file draws every color.
const STAR = "mask-[url(/decor/burst-star.svg)] mask-contain mask-center mask-no-repeat";

// Positions as a share of the box they sit in: the 299-wide constellation
// panel for the stars.
const at = (x: number, y: number, width: number): CSSProperties => ({ left: `${(x / width) * 100}%`, top: y });

function loadLit(applicationId: string) {
  return async (): Promise<LoadOutcome<Lit>> => {
    const result = await loadPlanSteps(applicationId, "first_month");
    if (result.kind === "signed-out") return "signed-out";
    if (result.kind === "failed") return { status: "failed", message: result.message };
    return {
      status: "ready",
      data: { autopay: false, plannedPurchase: result.done.has("planned_purchase"), paymentReminder: result.done.has("payment_reminder") },
    };
  };
}

export function ApprovedCard({
  application,
  celebrate,
  sampleStars,
}: {
  application: Application;
  celebrate: boolean;
  // Dev gallery only: this many stars lit, in order, with nothing loaded or saved.
  sampleStars?: number;
}) {
  if (sampleStars !== undefined) {
    const start = Object.fromEntries(STEPS.map((step, index) => [step.key, index < sampleStars])) as Lit;
    return (
      <>
        {celebrate ? <ArrivalEffects /> : null}
        <CardModule application={application} celebrate={celebrate} start={start} ready loadError={null} onRetry={() => {}} sample />
      </>
    );
  }
  return <SavedCard application={application} celebrate={celebrate} />;
}

function SavedCard({ application, celebrate }: { application: Application; celebrate: boolean }) {
  const load = useMemo(() => loadLit(application.id), [application.id]);
  const { loaded, retry } = useLoaded(load, signInPath(ROUTES.home));
  // A key per load state, so the stars start again from what was loaded.
  // The arrival effects sit outside it, so they run once.
  return (
    <>
      {celebrate ? <ArrivalEffects /> : null}
      <CardModule
        key={loaded.status}
        application={application}
        celebrate={celebrate}
        start={loaded.status === "ready" ? loaded.data : NONE_LIT}
        ready={loaded.status === "ready"}
        loadError={loaded.status === "failed" ? loaded.message : null}
        onRetry={retry}
      />
    </>
  );
}

function CardModule({
  application,
  celebrate,
  start,
  ready,
  loadError,
  onRetry,
  sample = false,
}: {
  application: Application;
  celebrate: boolean;
  start: Lit;
  ready: boolean;
  loadError: string | null;
  onRetry: () => void;
  sample?: boolean;
}) {
  const router = useRouter();
  const now = useNow();
  const [lit, setLit] = useState<Lit>(start);
  const [error, setError] = useState<string | null>(null);
  // Steps whose save is in flight; each is locked until its answer arrives.
  const [saving, setSaving] = useState<ReadonlySet<StepKey>>(new Set());

  async function toggle(key: StepKey, step: PlanStepName | null) {
    const value = !lit[key];
    setLit((current) => ({ ...current, [key]: value }));
    setError(null);
    if (!step || sample) return;
    setSaving((current) => new Set(current).add(key));
    const result = await savePlanStep(application.id, "first_month", step, value);
    setSaving((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (result.kind === "ok") return;
    // Undo only this star, so other saves in flight are not overwritten.
    setLit((current) => ({ ...current, [key]: !value }));
    if (result.kind === "signed-out") router.replace(signInPath(ROUTES.home));
    else setError(result.message);
  }

  const count = STEPS.filter((step) => lit[step.key]).length;

  return (
    <section aria-label={application.cardName} className="flex flex-col gap-3.5 rounded-card border-[1.5px] border-violet bg-white p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="relative h-[38px] w-14 shrink-0 rounded-[6px] bg-navy">
          <span className="absolute top-[9px] left-[7px] h-2 w-[11px] rounded-[2px] bg-amber" />
          <span className="absolute top-[27px] left-[7px] h-[3px] w-[26px] rounded-[2px] bg-white/35" />
          {/* The green check shows on the celebration only (C3: once the
              moment passes it is simply their card). */}
          {celebrate ? (
            <span className="absolute -top-2 left-11 flex size-5 items-center justify-center rounded-pill border-2 border-white bg-green">
              <span className="h-[8.25px] w-[10.5px] bg-white mask-[url(/icons/fit-check.svg)] mask-contain mask-center mask-no-repeat" />
            </span>
          ) : null}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-heading text-h6 font-medium text-navy">{application.cardName}</h2>
          {/* No approved_at column: the date is only known on the arrival from Mark result. */}
          {celebrate && now ? (
            <p className="text-[13px] leading-normal text-indigo-black/70" suppressHydrationWarning>
              Approved {now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-body-s text-indigo-black">Credit limit</p>
        <div className="flex items-baseline gap-2">
          {application.creditLimitCents === null ? (
            <p className="flex-1 text-body-m text-indigo-black">Not added</p>
          ) : (
            <p className={cn(SENSITIVE, "flex-1 font-number text-[2.25rem] leading-[2.75rem] font-medium text-navy")}>
              {moneyAmount(application.creditLimitCents)}
            </p>
          )}
          {/* Mark result is where the limit is saved. A 44px tap area (after:-inset-3) in the frame's 44px row. */}
          <Link
            href={applicationPath(application.id)}
            aria-label={application.creditLimitCents === null ? "Add credit limit" : "Edit credit limit"}
            className="relative text-body-s font-medium text-violet underline underline-offset-2 outline-none after:absolute after:-inset-3 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
          >
            {application.creditLimitCents === null ? "Add" : "Edit"}
          </Link>
        </div>
      </div>

      <div className="h-[1.5px] bg-off-white" />
      <h2 className="font-heading text-h6 font-medium text-navy">Your first month</h2>
      <Constellation count={count} />

      <ul className="flex flex-col gap-3.5">
        {STEPS.map((step) => (
          <li key={step.key}>
            <button
              type="button"
              role="checkbox"
              aria-checked={lit[step.key]}
              disabled={!ready || saving.has(step.key)}
              onClick={() => toggle(step.key, step.step)}
              className="flex w-full items-center gap-3 rounded-card bg-off-white px-3.5 py-2.5 text-left text-indigo-black outline-none hover:bg-selected-outline/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress"
            >
              {lit[step.key] ? (
                <span aria-hidden="true" className="flex size-6 shrink-0 animate-pop items-center justify-center rounded-pill bg-amber text-white">
                  <StarFill width={13} height={13} />
                </span>
              ) : (
                <span aria-hidden="true" className="size-6 shrink-0 rounded-pill border-[1.5px] border-indigo-black/70" />
              )}
              <span className="flex flex-col gap-0.5">
                <span className="text-body-m font-medium">{step.title}</span>
                <span className="text-body-s">{step.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {count === STEPS.length ? (
        <p role="status" className="flex animate-fade-in items-center gap-3 rounded-input bg-off-white px-4 py-3 text-body-s text-indigo-black">
          <StarFill aria-hidden="true" width={20} height={20} className="shrink-0 text-amber" />
          All three stars lit. Your card is set up to build good credit.
        </p>
      ) : null}
      {loadError ? (
        <div className="flex flex-col gap-2">
          <ErrorMessage>{loadError}</ErrorMessage>
          <Button variant="link" className="self-start text-violet" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </section>
  );
}

// The three stars by their centers in the 299 by 92 panel (212:1777).
const STAR_AT = [
  [40, 60],
  [154.5, 34],
  [269, 52],
] as const;

const SKY_DOTS = [
  [18, 72],
  [120, 16],
  [200, 80],
  [276, 22],
  [60, 40],
  [236, 58],
] as const;

// Lit stars are amber with a warm glow, the next one is white with a halo,
// the rest wait dim. A line turns solid amber once both its stars are lit
// (144:1733). The frames' light blue (lines, halo, count) is lavender here.
function Constellation({ count }: { count: number }) {
  return (
    <div className="relative h-[92px] overflow-hidden rounded-[16px] bg-navy">
      <svg aria-hidden="true" className="absolute inset-0 size-full" viewBox="0 0 299 92" preserveAspectRatio="none">
        {STAR_AT.slice(1).map(([x, y], index) => {
          const [fromX, fromY] = STAR_AT[index];
          const solid = index + 1 < count;
          return (
            <line
              key={x}
              x1={fromX}
              y1={fromY}
              x2={x}
              y2={y}
              className={solid ? "stroke-amber" : "stroke-off-white"}
              strokeOpacity={solid ? 1 : 0.35}
              strokeWidth={solid ? 2 : 1.25}
              strokeDasharray={solid ? undefined : "2.9 4.9"}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {SKY_DOTS.map(([x, y]) => (
        <span key={`${x}-${y}`} aria-hidden="true" className="absolute size-[2.5px] rounded-pill bg-white/35" style={at(x, y, 299)} />
      ))}
      {STAR_AT.map(([x, y], index) => {
        if (index < count) {
          return (
            <span key={x} aria-hidden="true" className="absolute -translate-1/2 drop-shadow-[0_0_6px_rgb(253_192_61/0.9)]" style={at(x, y, 299)}>
              <span className={cn(STAR, "block size-[22px] animate-pop bg-amber")} />
            </span>
          );
        }
        if (index === count) {
          return (
            <span key={x} aria-hidden="true" className="absolute -translate-1/2" style={at(x, y, 299)}>
              <span className="absolute top-1/2 left-1/2 size-[34px] -translate-1/2 rounded-pill bg-off-white/35" />
              <span className="block drop-shadow-[0_0_4px_rgb(255_255_255/0.7)]">
                <span className={cn(STAR, "block size-[19px] bg-white")} />
              </span>
            </span>
          );
        }
        return (
          <span key={x} aria-hidden="true" className="absolute -translate-1/2 drop-shadow-[0_0_2.5px_rgb(236_234_246/0.45)]" style={at(x, y, 299)}>
            <span className={cn(STAR, "block size-2.5 bg-off-white/70")} />
          </span>
        );
      })}
      <p aria-live="polite" className="absolute top-2.5 left-3.5 text-caption leading-normal font-semibold text-off-white">
        {count === STAR_AT.length ? "All stars lit" : `${count} of ${STAR_AT.length} lit`}
      </p>
    </div>
  );
}

// On the arrival from Mark result: drop the flag from the address so a reload
// or the back button is calm, and give Android phones one short buzz. iPhone
// browsers have no vibration API; reduced motion skips it.
function ArrivalEffects() {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete(CELEBRATE_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!still && typeof navigator.vibrate === "function") navigator.vibrate(40);
  }, []);
  return null;
}

// "You're approved!" in place of the greeting, on the celebration only (144:1564).
export function ApprovalHeading() {
  const now = useNow();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="min-h-5 text-body-s text-indigo-black uppercase" suppressHydrationWarning>
        {now ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : ""}
      </p>
      <h1 className="font-heading text-h1 font-medium text-navy">You’re approved!</h1>
      <p className="text-body-m text-indigo-black">Light all three stars this month.</p>
    </div>
  );
}

// Star confetti on the arrival from Mark result (Ben, 2026-10-24: like the
// "Congratulations" effect in iMessage). The frame's stars (144:1601 to
// 144:1621) fall across the whole screen once, about three seconds, then the
// layer removes itself. CSS does the motion; nothing can be tapped through it.
// Reduced motion shows nothing. Positions are fixed (seeded), so the server
// and the browser draw the same thing. The frame's light-blue stars are lavender.
const CONFETTI_COLORS = ["bg-amber", "bg-violet", "bg-green", "bg-selected-outline"] as const;

function seededConfetti(count: number) {
  let seed = 11;
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: count }, (_, index) => ({
    left: Math.round(next() * 96),
    size: 10 + Math.round(next() * 12),
    delay: Math.round(next() * 700),
    duration: 2200 + Math.round(next() * 1000),
    drift: Math.round((next() - 0.5) * 90),
    spin: Math.round((next() - 0.5) * 720),
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  }));
}

const CONFETTI = seededConfetti(36);
export const CONFETTI_MS = Math.max(...CONFETTI.map((star) => star.delay + star.duration));

export function StarConfetti() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), CONFETTI_MS + 100);
    return () => clearTimeout(timer);
  }, []);
  if (done) return null;
  return (
    <div aria-hidden="true" data-testid="confetti" className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden">
      {CONFETTI.map((star, index) => (
        <span
          key={index}
          className={cn(STAR, star.color, "absolute -top-6 animate-confetti")}
          style={
            {
              left: `${star.left}%`,
              width: star.size,
              height: star.size,
              animationDelay: `${star.delay}ms`,
              animationDuration: `${star.duration}ms`,
              "--confetti-drift": `${star.drift}px`,
              "--confetti-spin": `${star.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
