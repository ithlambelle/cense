"use client";

import ChevronRight from "@gravity-ui/icons/ChevronRight";
import StarFill from "@gravity-ui/icons/StarFill";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { centsToField, limitToCents } from "@/components/applications/mark-result";
import { Constellation, STAR } from "@/components/home/constellation";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE } from "@/lib/analytics";
import { saveAutopay, saveCreditLimit } from "@/lib/api-client/applications";
import { loadPlanSteps, savePlanStep, type PlanStepName } from "@/lib/api-client/plans";
import type { Application } from "@/lib/api/application";
import { moneyAmount } from "@/lib/money";
import { cardPath, CELEBRATE_PARAM, paymentRemindersPath, ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

// Home's approved card (Flow 1, Figma 144:1555, 144:1655, 144:1733): the card,
// its limit and the first month's three steps as stars in one module.

type StepKey = "autopay" | "plannedPurchase" | "paymentReminder";
type Lit = Record<StepKey, boolean>;

// Copy from the frames. Autopay is not a plan step: it is the card's own
// autopay status, read on the server with the card and saved with PATCH
// /applications/{id}. The payment reminder is not ticked here: its row opens
// the reminder screen (US-08), which lights the star when it saves, so the
// star is never lit without a reminder behind it.
const STEPS: { key: StepKey; step: PlanStepName | null; title: string; detail: string; opensReminders?: true }[] = [
  { key: "autopay", step: null, title: "Turn on autopay", detail: "Statement balance, every month" },
  { key: "plannedPurchase", step: "planned_purchase", title: "Plan one purchase", detail: "A small cost you already budget for" },
  { key: "paymentReminder", step: "payment_reminder", title: "Set a payment reminder", detail: "Use the due date on your statement", opensReminders: true },
];

// List row, Tinted (273:2196), shared by the tick rows and the reminder link.
const ROW =
  "flex w-full items-center gap-3 rounded-[14px] bg-off-white px-3.5 py-3 text-left text-indigo-black hover:bg-selected-outline/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const NONE_LIT: Lit = { autopay: false, plannedPurchase: false, paymentReminder: false };

// The reminder star needs the step and the card's saved days: the old first-month
// page ticked the step on its own, so a step without days is not a reminder.
function loadLit(applicationId: string, autopay: boolean, reminderDaysSaved: boolean) {
  return async (): Promise<LoadOutcome<Lit>> => {
    const result = await loadPlanSteps(applicationId, "first_month");
    if (result.kind === "signed-out") return "signed-out";
    if (result.kind === "failed") return { status: "failed", message: result.message };
    return {
      status: "ready",
      data: { autopay, plannedPurchase: result.done.has("planned_purchase"), paymentReminder: reminderDaysSaved && result.done.has("payment_reminder") },
    };
  };
}

export function ApprovedCard({
  application,
  autopayOn,
  reminderDaysSaved = false,
  celebrate,
  sampleStars,
}: {
  application: Application;
  // The saved autopay status is "on" (off and unknown leave the star out).
  autopayOn: boolean;
  // The card has a saved payment due day (set on the reminder screen).
  reminderDaysSaved?: boolean;
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
  return <SavedCard application={application} autopayOn={autopayOn} reminderDaysSaved={reminderDaysSaved} celebrate={celebrate} />;
}

function SavedCard({
  application,
  autopayOn,
  reminderDaysSaved,
  celebrate,
}: {
  application: Application;
  autopayOn: boolean;
  reminderDaysSaved: boolean;
  celebrate: boolean;
}) {
  const load = useMemo(() => loadLit(application.id, autopayOn, reminderDaysSaved), [application.id, autopayOn, reminderDaysSaved]);
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
        start={loaded.status === "ready" ? loaded.data : { ...NONE_LIT, autopay: autopayOn }}
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
    if (sample) return;
    setSaving((current) => new Set(current).add(key));
    const result = step
      ? await savePlanStep(application.id, "first_month", step, value)
      : await saveAutopay(application.id, value);
    setSaving((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (result.kind === "ok") {
      // Autopay reaches Home in the server render: refresh it, or Back from
      // another screen restores the cached Home with the old star.
      if (!step) router.refresh();
      return;
    }
    // Undo only this star, so other saves in flight are not overwritten.
    setLit((current) => ({ ...current, [key]: !value }));
    if (result.kind === "signed-out") router.replace(signInPath(ROUTES.home));
    else setError(result.message);
  }

  const count = STEPS.filter((step) => lit[step.key]).length;

  return (
    <section aria-label={application.cardName} className="flex flex-col gap-3.5 rounded-card border-[1.5px] border-violet bg-white p-5">
      {/* The card's own page (with its status, from #62). The whole title row is the
          link, with a chevron so it reads as tappable (G4). A card added from outside
          the catalog has no page, so its row is not a link. */}
      <TitleRow application={application}>
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
      </TitleRow>

      <CreditLimit application={application} sample={sample} />

      <div className="h-[1.5px] bg-off-white" />
      <h2 className="font-heading text-h6 font-medium text-navy">Your first month</h2>
      <Constellation count={count} layout="three" />

      <ul className="flex flex-col gap-3.5">
        {STEPS.map((step) => (
          <li key={step.key}>
            {step.opensReminders ? (
              // Lit or not, it opens the screen, so the student can change the days.
              <Link href={paymentRemindersPath(application.id)} className={ROW}>
                <StepRowContent title={step.title} detail={step.detail} lit={lit[step.key]} saysDone />
              </Link>
            ) : (
              <button
                type="button"
                role="checkbox"
                aria-checked={lit[step.key]}
                disabled={!ready || saving.has(step.key)}
                onClick={() => toggle(step.key, step.step)}
                className={cn(ROW, "disabled:cursor-progress")}
              >
                <StepRowContent title={step.title} detail={step.detail} lit={lit[step.key]} />
              </button>
            )}
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

// List row, Tinted (273:2196): a done step's star lights and its title goes
// quiet. A link has no checked state, so it says "done" to screen readers.
function StepRowContent({ title, detail, lit, saysDone = false }: { title: string; detail: string; lit: boolean; saysDone?: boolean }) {
  return (
    <>
      {lit ? (
        <span aria-hidden="true" className="flex size-6 shrink-0 animate-pop items-center justify-center rounded-pill bg-amber text-white">
          <StarFill width={13} height={13} />
        </span>
      ) : (
        <span aria-hidden="true" className="size-6 shrink-0 rounded-pill border-[1.5px] border-indigo-black" />
      )}
      <span className="flex flex-col gap-[3px] leading-[normal]">
        <span className={cn("text-body-m leading-[normal]", lit ? "text-indigo-black/70" : "font-medium")}>
          {title}
          {lit && saysDone ? <span className="sr-only">, done</span> : null}
        </span>
        <span className="text-body-s leading-[normal] text-indigo-black/70">{detail}</span>
      </span>
    </>
  );
}

function TitleRow({ application, children }: { application: Application; children: ReactNode }) {
  if (!application.cardId) return <div className="flex items-center gap-3">{children}</div>;
  return (
    <Link
      href={cardPath(application.cardId, "home")}
      aria-label={`${application.cardName} details`}
      className="-m-2 flex items-center gap-3 rounded-input p-2 hover:bg-off-white/60 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
      <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-indigo-black/70" />
    </Link>
  );
}

// The limit as one big number with Edit (144:1670). Edit opens a field in
// place: only the limit is saved (PATCH creditLimitCents), never the status.
function CreditLimit({ application, sample }: { application: Application; sample: boolean }) {
  const router = useRouter();
  const [cents, setCents] = useState(application.creditLimitCents);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function open() {
    setValue(centsToField(cents));
    setError(null);
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = limitToCents(value);
    if (next === undefined) {
      setError("Enter the limit in dollars, like 500 or 1,500.");
      return;
    }
    if (sample) {
      setCents(next);
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await saveCreditLimit(application.id, next);
    setSaving(false);
    if (result.kind === "signed-out") {
      router.replace(signInPath(ROUTES.home));
      return;
    }
    if (result.kind === "failed") {
      setError(result.message);
      return;
    }
    setCents(next);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <form onSubmit={save} className={cn(SENSITIVE, "flex flex-col gap-3")} noValidate>
        <TextField
          label="Credit limit"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="$500"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={error ?? undefined}
          disabled={saving}
        />
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" chevron={false} pending={saving}>
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-body-s text-indigo-black">Credit limit</p>
      <div className="flex items-baseline gap-2">
        {cents === null ? (
          <p className="flex-1 text-body-m text-indigo-black">Not added</p>
        ) : (
          <p className={cn(SENSITIVE, "flex-1 font-number text-[2.25rem] leading-[2.75rem] font-medium text-navy")}>
            {moneyAmount(cents)}
          </p>
        )}
        {/* A 44px tap area (after:-inset-3) in the frame's 44px row. */}
        <button
          type="button"
          onClick={open}
          aria-label={cents === null ? "Add credit limit" : "Edit credit limit"}
          className="relative text-body-s font-medium text-violet underline underline-offset-2 after:absolute after:-inset-3 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
        >
          {cents === null ? "Add" : "Edit"}
        </button>
      </div>
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
