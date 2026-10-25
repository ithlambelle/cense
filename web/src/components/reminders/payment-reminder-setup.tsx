"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE, track } from "@/lib/analytics";
import {
  parseDay,
  saveReminderSetup,
  type ReminderChoices,
} from "@/lib/api-client/reminder-setup";
import { paymentRemindersPath, ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

const DAY_ERROR = "Enter a day from 1 to 31.";
// Where to find the two days, app first: a new card has no statement yet. On
// the first field, so a screen reader reads it there; "Both" covers the second.
const DAY_HINT = "Both are in your card’s app or on your statement.";

// The fields as drawn: white fill, off-white 1.5px edge, 20px corners, 16px
// sides and 14px top and bottom (Figma 144:1828). The padding is on the input,
// so a tap anywhere in the box focuses it.
const DAY_FIELD = "h-auto bg-white p-0";
const DAY_INPUT = "px-4 py-3.5 leading-[normal] text-navy";

type Props = {
  applicationId: string;
  // The card's saved days, or null before they are set.
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  // The student's saved choices. They cover every card, not only this one.
  savedChoices: ReminderChoices;
  // False after the student unsubscribed; saving with a reminder on turns emails back on.
  emailsOn?: boolean;
  // This card gets the one first-statement email (a card the student just
  // got, with that email on): the screen says so.
  firstStatementEmail?: boolean;
  email: string | null;
  // The back arrow: Home, or the card's page when opened from it.
  back?: { href: string; label: string };
  // Replaced in the dev preview, so it never calls the API.
  save?: typeof saveReminderSetup;
  // Where a finished save goes. Home, where the reminder star is now lit, or
  // the card's page it was opened from.
  doneHref?: string;
};

// Payment reminders / due date setup (US-08, Figma 144:1822, change card C4):
// two days entered once, and two reminder emails, each 3 days ahead. A new
// card also gets one autopay check after its first statement; that email is
// switched on and off in Reminder settings, so here it is only named. The
// toggles are the student's, not the card's, and the screen says so
// (Reminders audit R-04, R-08).
export function PaymentReminderSetup({
  applicationId,
  statementClosingDay,
  paymentDueDay,
  savedChoices,
  emailsOn = true,
  firstStatementEmail = false,
  email,
  save = saveReminderSetup,
  back = { href: ROUTES.home, label: "Home" },
  doneHref = ROUTES.home,
}: Props) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [closing, setClosing] = useState(statementClosingDay === null ? "" : String(statementClosingDay));
  const [due, setDue] = useState(paymentDueDay === null ? "" : String(paymentDueDay));
  const [closingError, setClosingError] = useState<string | null>(null);
  const [dueError, setDueError] = useState<string | null>(null);
  const [choices, setChoices] = useState<ReminderChoices>(savedChoices);
  // What the server holds now, so a retry only resends choices still unsaved.
  const [baseline, setBaseline] = useState<ReminderChoices>(savedChoices);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const closingDay = parseDay(closing);
    const dueDay = parseDay(due);
    setClosingError(closingDay === null ? DAY_ERROR : null);
    setDueError(dueDay === null ? DAY_ERROR : null);
    if (closingDay === null || dueDay === null) return;

    setPending(true);
    setError(null);
    const result = await save({
      applicationId,
      days: { statementClosingDay: closingDay, paymentDueDay: dueDay },
      choices,
      savedChoices: baseline,
      emailsOn,
    });
    // The student left while it saved: the answer must not move them again.
    if (!isMounted()) return;
    if (result.kind === "ok") {
      track("reminder_setup_saved", { payment_due: choices.paymentDue, statement_closing: choices.statementClosing });
      // Stays pending while Home loads with the star lit. Replace, not push:
      // Back from Home goes where the student came from, not to this form (as
      // Mark result does).
      router.replace(doneHref);
      router.refresh();
      return;
    }
    setPending(false);
    if (result.kind === "signed-out") {
      router.replace(signInPath(paymentRemindersPath(applicationId)));
      return;
    }
    // Only the star failed, so the choices are saved.
    if (result.stage === "star") setBaseline(choices);
    setError(result.message);
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={back.href} backLabel={back.label} />
        {/* pt-2: the shared header is 8px taller than the frame's, so the
            heading still starts 96px from the top as drawn. */}
        <form method="post" onSubmit={submit} noValidate className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-6">
          <h1 className="font-heading text-h3 font-medium text-navy">Never miss a payment</h1>
          <p className="text-body-s text-indigo-black/70">
            {firstStatementEmail
              ? "We’ll email you before your statement closes and before your bill is due, plus one autopay check after your first statement."
              : "We’ll email you before your statement closes and before your bill is due."}
          </p>

          <TextField
            label="Statement closes on day"
            hint={DAY_HINT}
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={closing}
            onChange={(event) => setClosing(event.target.value)}
            error={closingError ?? undefined}
            disabled={pending}
            className={DAY_FIELD}
            inputClassName={DAY_INPUT}
          />
          <TextField
            label="Payment due on day"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={due}
            onChange={(event) => setDue(event.target.value)}
            error={dueError ?? undefined}
            disabled={pending}
            className={DAY_FIELD}
            inputClassName={DAY_INPUT}
          />

          <ReminderToggle
            title="3 days before the due date"
            detail={email ? `Email to ${email}` : "By email"}
            sensitive={email !== null}
            checked={choices.paymentDue}
            disabled={pending}
            onChange={(paymentDue) => setChoices((current) => ({ ...current, paymentDue }))}
          />
          <ReminderToggle
            title="3 days before the statement closes"
            detail="Pay it down for a lower reported balance"
            checked={choices.statementClosing}
            disabled={pending}
            onChange={(statementClosing) => setChoices((current) => ({ ...current, statementClosing }))}
          />
          {/* The toggle rows' detail style (144:1834). */}
          <p className="text-caption leading-[normal] text-indigo-black/65">Applies to all your cards.</p>

          <div className="flex-1" />
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          <Button
            type="submit"
            pending={pending}
            // The bottom bar hides while a field has focus and returns when it
            // loses it, which moves this bottom-pinned button. With a mouse,
            // pressing the button blurs the field first, so the release lands
            // where the button used to be and the click is lost. Keeping focus
            // in the field until the click lands avoids that. Touch and the
            // keyboard (Enter in a field) are unaffected.
            onMouseDown={(event) => event.preventDefault()}
          >
            Save reminders
          </Button>
        </form>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

// One reminder row (Figma 144:1834): title and detail on the left, the
// toggle on the right, 12px above and below.
function ReminderToggle({
  title,
  detail,
  sensitive = false,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  detail: string;
  // The detail shows the student's email, so replay masks it.
  sensitive?: boolean;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p id={`${id}-title`} className="text-body-m leading-[normal] text-navy">
          {title}
        </p>
        <p id={`${id}-detail`} className={cn(sensitive && SENSITIVE, "text-caption leading-[normal] break-words text-indigo-black/65")}>
          {detail}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next)}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-detail`}
      />
    </div>
  );
}
