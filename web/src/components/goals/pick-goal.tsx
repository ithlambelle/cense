"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/choice-card";
import { ErrorMessage } from "@/components/ui/error-message";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE, track } from "@/lib/analytics";
import type { Goal } from "@/lib/api/goals";
import { deleteGoal, saveGoal } from "@/lib/api-client/goals";
import { GOAL_COPY, GOAL_LABELS, suggestionHint } from "@/lib/goals/copy";
import { addMonthsIso, MAX_YEARS } from "@/lib/goals/plan";
import { FIRST_PRESETS, goalName, MAX_GOAL_CENTS, MORE_PRESETS, type GoalPreset, type Suggestion } from "@/lib/goals/presets";
import { centsToInput, dollarsToCents, moneyAmount } from "@/lib/money";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

// Created with Claude Code (2026-11-26). Pick a goal (US-17, Demo Day step 4):
// the goal as borderless Choice cards (G1), three first and the rest behind
// More goals; then how much, filled in with the suggestion and where it came
// from, and an optional date. See my plan saves it and opens Your plan; Not
// now goes Home. No Figma frame exists for goals yet, so the screen is built
// from the setup questions' parts. A saved goal comes back filled in, with a
// way to remove it that first says in one line what happens to the set-aside.

type FieldError = { field: "pick" | "name" | "amount" | "date" | "form"; text: string };
type Suggestions = Partial<Record<GoalPreset, Suggestion | null>>;

export function PickGoal({
  saved,
  preselect = null,
  setAsideCents,
  today,
  suggestions,
}: {
  saved: Goal | null;
  // A goal to start picked (Home's next step), with its suggestion filled in.
  // The saved goal itself, or none, changes nothing.
  preselect?: GoalPreset | null;
  // The student's set-aside now, for what Remove my goal does to it.
  setAsideCents: number;
  today: string;
  suggestions: Suggestions;
}) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const titleId = useId();
  const fresh = preselect !== null && preselect !== saved?.preset ? preselect : null;
  const [preset, setPreset] = useState<GoalPreset | null>(fresh ?? saved?.preset ?? null);
  // "open": shown since the screen opened (a saved goal behind More goals);
  // "tapped": the student opened them, so focus moves to the first new card.
  const [more, setMore] = useState<"closed" | "open" | "tapped">(
    (fresh !== null && MORE_PRESETS.includes(fresh)) || (fresh === null && saved !== null && MORE_PRESETS.includes(saved.preset)) ? "open" : "closed",
  );
  const [name, setName] = useState(fresh === null && saved?.preset === "other" ? saved.name : "");
  const freshSuggestion = fresh ? suggestions[fresh] : null;
  const [amount, setAmount] = useState(
    fresh ? (freshSuggestion ? centsToInput(freshSuggestion.amountCents) : "") : saved ? centsToInput(saved.amountCents) : "",
  );
  // Only a date the student picked: the 6-month default shows as no date.
  const savedDate = saved?.dateChosen ? saved.targetDate : "";
  const [date, setDate] = useState(fresh ? "" : savedDate);
  const [error, setError] = useState<FieldError | null>(null);
  const [pending, setPending] = useState<"save" | "remove" | null>(null);
  const [confirming, setConfirming] = useState(false);

  const suggestion = preset ? (suggestions[preset] ?? null) : null;
  const tomorrow = nextDay(today);
  const latest = addMonthsIso(today, MAX_YEARS * 12);

  // A new pick starts from its own suggestion, or the saved goal's amount
  // when it is the saved goal again.
  function pick(next: GoalPreset) {
    setError(null);
    setPreset(next);
    if (saved?.preset === next) {
      setAmount(centsToInput(saved.amountCents));
      setName(next === "other" ? saved.name : "");
      setDate(savedDate);
      return;
    }
    const suggested = suggestions[next];
    setAmount(suggested ? centsToInput(suggested.amountCents) : "");
    setName("");
    setDate("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!preset) return setError({ field: "pick", text: GOAL_COPY.pickError });
    // The server's own rule, so a name that only looks filled in is caught here.
    const goalTitle = goalName(preset, name);
    if (!goalTitle) return setError({ field: "name", text: GOAL_COPY.nameError });
    const amountCents = dollarsToCents(amount, { minCents: 1, maxCents: Number.MAX_SAFE_INTEGER });
    if (amountCents === null) return setError({ field: "amount", text: GOAL_COPY.amountError });
    if (amountCents > MAX_GOAL_CENTS) return setError({ field: "amount", text: GOAL_COPY.amountTooBig });
    // The picker's min and max only guide it; a typed date can pass them.
    // ISO dates compare as text.
    const targetDate = preset === "pay_off_card" ? "" : date;
    if (targetDate && targetDate <= today) return setError({ field: "date", text: GOAL_COPY.dateAfterToday });
    if (targetDate && targetDate > latest) return setError({ field: "date", text: GOAL_COPY.dateTooLate });

    setPending("save");
    setError(null);
    const result = await saveGoal({ preset, name: goalTitle, amountCents, targetDate: targetDate || null });
    if (!isMounted()) return;
    if (result.kind === "ok") {
      track("goal_saved", { preset, amount: suggestion?.amountCents === amountCents ? "suggested" : "typed", dated: Boolean(targetDate) });
      // Replace, as the setup questions do: Back from the plan's own arrow
      // returns here, and the browser's Back never stacks the steps.
      router.replace(ROUTES.startPlan);
      return;
    }
    setPending(null);
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.startGoal));
    setError({ field: "form", text: result.message });
  }

  async function remove() {
    if (pending) return;
    setPending("remove");
    setError(null);
    const result = await deleteGoal();
    if (!isMounted()) return;
    if (result.kind === "ok") {
      router.replace(ROUTES.home);
      router.refresh();
      return;
    }
    setPending(null);
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.startGoal));
    setError({ field: "form", text: result.message });
  }

  const card = (option: GoalPreset, index: number, list: readonly GoalPreset[]) => {
    const selected = preset === option;
    return (
      <ChoiceCard
        key={option}
        state={selected ? "selected" : "default"}
        aria-pressed={selected}
        onClick={() => pick(option)}
        disabled={pending !== null}
        autoFocus={more === "tapped" && list === MORE_PRESETS && index === 0}
      >
        {GOAL_LABELS[option]}
      </ChoiceCard>
    );
  };

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="flex flex-1 flex-col">
          <form method="post" noValidate onSubmit={submit} className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
            <div className="flex flex-col gap-2">
              <h1 id={titleId} className="font-heading text-h3 font-medium text-navy">
                {GOAL_COPY.title}
              </h1>
              <p className="text-body-s text-indigo-black">{GOAL_COPY.body}</p>
            </div>
            {/* What a student saves for is personal: masked in session replay. */}
            <div role="group" aria-labelledby={titleId} className={`${SENSITIVE} flex flex-col gap-3`}>
              {FIRST_PRESETS.map(card)}
              {more === "closed" ? null : MORE_PRESETS.map(card)}
            </div>
            {more === "closed" ? (
              <Button type="button" variant="secondary" className="self-start px-0" aria-expanded={false} onClick={() => setMore("tapped")}>
                {GOAL_COPY.moreGoals}
              </Button>
            ) : null}
            {error?.field === "pick" ? <ErrorMessage>{error.text}</ErrorMessage> : null}

            {preset ? (
              <div className={`${SENSITIVE} flex flex-col gap-4 motion-safe:animate-fade-up`}>
                {saved && saved.preset !== preset ? <p className="text-body-s text-indigo-black">{GOAL_COPY.replacesGoal(saved.name)}</p> : null}
                {preset === "other" ? (
                  <TextField
                    label={GOAL_COPY.nameLabel}
                    autoComplete="off"
                    maxLength={40}
                    value={name}
                    onChange={(event) => {
                      setError(null);
                      setName(event.target.value);
                    }}
                    error={error?.field === "name" ? error.text : undefined}
                    disabled={pending !== null}
                  />
                ) : null}
                <TextField
                  label={GOAL_COPY.amountLabel}
                  hint={suggestion ? suggestionHint(moneyAmount(suggestion.amountCents), suggestion.source) : undefined}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="$0"
                  value={amount}
                  onChange={(event) => {
                    setError(null);
                    setAmount(event.target.value);
                  }}
                  error={error?.field === "amount" ? error.text : undefined}
                  disabled={pending !== null}
                />
                {/* Switching to Pay off my card, which sets nothing aside. */}
                {preset === "pay_off_card" && saved && saved.preset !== "pay_off_card" && setAsideLine(saved, setAsideCents) ? (
                  <p className="text-body-s text-indigo-black">{setAsideLine(saved, setAsideCents)}</p>
                ) : null}
                {/* Paying off a card has no date: nothing is set aside for it. */}
                {preset === "pay_off_card" ? null : (
                  <TextField
                    label={GOAL_COPY.dateLabel}
                    hint={GOAL_COPY.dateHint}
                    type="date"
                    min={tomorrow}
                    max={latest}
                    value={date}
                    onChange={(event) => {
                      setError(null);
                      setDate(event.target.value);
                    }}
                    error={error?.field === "date" ? error.text : undefined}
                    disabled={pending !== null}
                  />
                )}
              </div>
            ) : null}

            <div className="flex-1" />
            {error?.field === "form" ? <ErrorMessage>{error.text}</ErrorMessage> : null}
            <div className="flex flex-col gap-2">
              <Button type="submit" pending={pending === "save"} disabled={pending === "remove"}>
                {GOAL_COPY.continue}
              </Button>
              {/* Replace: Not now leaves the flow, so Back never returns to it. */}
              <Link href={ROUTES.home} replace className={buttonVariants({ variant: "secondary" })}>
                {GOAL_COPY.notNow}
              </Link>
              {saved && !confirming ? (
                <Button type="button" variant="link" className="self-center" disabled={pending !== null} onClick={() => setConfirming(true)}>
                  {GOAL_COPY.remove}
                </Button>
              ) : null}
              {saved && confirming ? (
                <div role="group" aria-label={GOAL_COPY.removeAsk} className="flex flex-col gap-2 pt-2">
                  <p className={`${SENSITIVE} text-center text-body-s text-indigo-black`}>{removeLine(saved, setAsideCents)}</p>
                  <Button type="button" variant="outline" pending={pending === "remove"} disabled={pending === "save"} onClick={remove}>
                    {GOAL_COPY.removeConfirm}
                  </Button>
                  <Button type="button" variant="secondary" disabled={pending !== null} onClick={() => setConfirming(false)}>
                    {GOAL_COPY.removeKeep}
                  </Button>
                </div>
              ) : null}
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

// What removing the goal, or switching it to Pay off my card, does to the
// set-aside, in one line: it goes when it still holds what Accept plan wrote
// (remove_goal(), goals_release_set_aside); one the student changed since
// stays. Null when there is no set-aside.
function setAsideLine(goal: Goal, setAsideCents: number): string | null {
  if (setAsideCents === 0) return null;
  const amount = moneyAmount(setAsideCents);
  return goal.acceptedMonthlyCents === setAsideCents ? GOAL_COPY.setAsideStops(amount) : GOAL_COPY.setAsideStays(amount);
}

function removeLine(goal: Goal, setAsideCents: number): string {
  const line = setAsideLine(goal, setAsideCents);
  return line ? `${GOAL_COPY.removeAsk} ${line}` : GOAL_COPY.removeAsk;
}

// The day after an ISO date.
function nextDay(date: string): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
