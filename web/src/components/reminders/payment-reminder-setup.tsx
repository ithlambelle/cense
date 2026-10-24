"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE } from "@/lib/analytics";
import {
  parseDay,
  saveReminderSetup,
  type ReminderChoices,
} from "@/lib/api-client/reminder-setup";
import { paymentRemindersPath, ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

const DAY_ERROR = "Enter a day from 1 to 31.";

// The fields as drawn: white fill, off-white 1.5px edge, 20px corners, 16px
// sides and 14px top and bottom (Figma 144:1828).
const DAY_FIELD = "h-auto bg-white px-4 py-3.5";

type Props = {
  applicationId: string;
  // The card's saved days, or null before they are set.
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  // The student's saved choices. They cover every card, not only this one.
  savedChoices: ReminderChoices;
  email: string | null;
  // Replaced in the dev preview, so it never calls the API.
  save?: typeof saveReminderSetup;
  // Where a finished save goes. Home, where the reminder star is now lit.
  doneHref?: string;
};

// Payment reminders / due date setup (US-08, Figma 144:1822, change card C4):
// two days entered once, and two reminder emails, each 3 days ahead.
export function PaymentReminderSetup({
  applicationId,
  statementClosingDay,
  paymentDueDay,
  savedChoices,
  email,
  save = saveReminderSetup,
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
    });
    // The student left while it saved: the answer must not move them again.
    if (!isMounted()) return;
    if (result.kind === "ok") {
      // Stays pending while Home loads with the star lit.
      router.push(doneHref);
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
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        {/* pt-2: the shared header is 8px taller than the frame's, so the
            heading still starts 96px from the top as drawn. */}
        <form method="post" onSubmit={submit} noValidate className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-6">
          <h1 className="font-heading text-h3 font-medium text-navy">Never miss a payment</h1>
          <p className="text-body-s text-indigo-black/70">
            We’ll email you before your statement closes and before your bill is due.
          </p>

          <TextField
            label="Statement closes on day"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={closing}
            onChange={(event) => setClosing(event.target.value)}
            error={closingError ?? undefined}
            disabled={pending}
            className={DAY_FIELD}
            inputClassName="leading-[normal] text-navy"
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
            inputClassName="leading-[normal] text-navy"
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
            title="When the statement closes"
            detail="Pay it down for a lower reported balance"
            checked={choices.statementClosing}
            disabled={pending}
            onChange={(statementClosing) => setChoices((current) => ({ ...current, statementClosing }))}
          />

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
