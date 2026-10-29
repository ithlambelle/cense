"use client";

import Calendar from "@gravity-ui/icons/Calendar";
import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DeniedLayout } from "@/components/denied/denied-layout";
import { Button, ButtonChevron, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SelectionMark } from "@/components/ui/selection-mark";
import { saveReapplyReminder } from "@/lib/api-client/reminders";
import { addMonths, formatIsoDate, toIsoDate } from "@/lib/dates";
import { deniedPath, ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { useNow } from "@/lib/use-now";

type Choice = "six-months" | "custom";

// Choose when to check in (Figma 144:2145, was 397:2362, S23). Saves a reapply
// reminder email (POST /reminders, spec C2) and opens the saved check, which
// reads it back before saying it is saved.
export function ReminderSetup({ applicationId }: { applicationId: string | null }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const now = useNow();
  const today = now ? toIsoDate(now) : null;
  const [choice, setChoice] = useState<Choice>("six-months");
  const [customDate, setCustomDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Midday, so adding a day never lands on the wrong date across a clock change.
  const todayNoon = today ? new Date(`${today}T12:00:00`) : null;
  const sixMonths = todayNoon ? toIsoDate(addMonths(todayNoon, 6)) : null;
  const tomorrow = todayNoon ? toIsoDate(new Date(todayNoon.getTime() + 86_400_000)) : undefined;
  // One year at most, the limit the reminder table enforces (366 days).
  const latest = todayNoon ? toIsoDate(addMonths(todayNoon, 12)) : undefined;
  const remindOn = choice === "six-months" ? sixMonths : customDate || null;
  const remindOnLabel = remindOn ? formatIsoDate(remindOn) : null;

  async function save() {
    if (!applicationId || !today || !latest || !remindOn || !remindOnLabel) return;
    // The input's min and max only guide the date picker; a typed date can
    // pass them, so both ends are checked here. ISO dates compare as text.
    if (remindOn <= today) {
      setError("Pick a date after today.");
      return;
    }
    if (remindOn > latest) {
      setError(`Pick a date no later than ${formatIsoDate(latest)}.`);
      return;
    }
    setPending(true);
    setError(null);
    const result = await saveReapplyReminder(applicationId, remindOn);
    // The student left while it saved: the answer must not move them again.
    if (!isMounted()) return;
    if (result.kind === "ok") {
      // Replace, not push: Back from the saved screen goes to the plan, never
      // to this form again for a reminder that is already saved.
      router.replace(deniedPath("reminderSaved", applicationId));
      return;
    }
    setPending(false);
    if (result.kind === "signed-out") {
      router.replace(signInPath(ROUTES.home));
      return;
    }
    setError(result.message);
  }

  return (
    <DeniedLayout backHref={deniedPath("plan", applicationId)} backLabel="Plan">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 font-medium text-navy">Choose when to check in</h1>
        <p className="text-body-m text-indigo-black">We’ll remind you when it’s time. No new application today.</p>
      </div>

      <div role="group" aria-label="When to remind you" className="flex flex-col gap-6">
        <TimingOption
          selected={choice === "six-months"}
          onSelect={() => setChoice("six-months")}
          title="In about 6 months"
          detail={sixMonths ? (formatIsoDate(sixMonths) ?? "") : ""}
        />
        <TimingOption
          selected={choice === "custom"}
          onSelect={() => setChoice("custom")}
          title="Choose another date"
          detail="Pick a date that works for you"
        />
      </div>

      {choice === "custom" ? (
        <label className="flex flex-col gap-1">
          <span className="text-body-s text-indigo-black">Reminder date</span>
          <input
            type="date"
            value={customDate}
            min={tomorrow}
            max={latest}
            onChange={(event) => setCustomDate(event.target.value)}
            className="h-12 rounded-input border-[1.5px] border-off-white bg-off-white px-3.5 text-body-m text-indigo-black outline-none focus:border-violet"
          />
        </label>
      ) : null}

      <section className="relative flex flex-col gap-3 rounded-card bg-off-white p-5 text-indigo-black">
        <div className="flex items-center gap-2">
          <Calendar aria-hidden="true" width={22} height={22} className="text-violet" />
          <h2 className="font-heading text-h6 font-medium">Before you reapply</h2>
        </div>
        <p className="text-body-s">Your 5-step plan covers what to do until then.</p>
        {/* The link's box covers the whole card (after:inset-0), so a tap anywhere opens the plan
            and the row can keep the frame's 20px height (275:2144). */}
        <Link
          href={deniedPath("plan", applicationId)}
          className="flex items-center justify-between text-body-s font-semibold text-violet outline-none after:absolute after:inset-0 after:rounded-card hover:text-violet-hover focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
        >
          See the 5-step plan
          <ChevronRight aria-hidden="true" width={14} height={14} />
        </Link>
      </section>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      {applicationId ? (
        <Button pending={pending} disabled={!remindOnLabel} onClick={save}>
          Save reapply reminder
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-body-s text-indigo-black">Open this from your card on Home to set a reminder for it.</p>
          <Link href={ROUTES.home} className={buttonVariants()}>
            Go to Home
            <ButtonChevron />
          </Link>
        </div>
      )}
    </DeniedLayout>
  );
}

function TimingOption({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="flex min-h-20 w-full items-center gap-4 rounded-card border-[1.5px] border-violet bg-white px-5 py-3 text-left hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-indigo-black">
        <span className="font-heading text-h6 font-medium">{title}</span>
        <span className="min-h-5 text-body-s">{detail}</span>
      </span>
      <SelectionMark selected={selected} />
    </button>
  );
}
