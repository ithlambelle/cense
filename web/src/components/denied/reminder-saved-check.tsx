"use client";

import Link from "next/link";

import { DeniedLayout } from "@/components/denied/denied-layout";
import { ReminderSavedView } from "@/components/denied/reminder-saved-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { FALLBACK_MESSAGE } from "@/lib/api-client/client";
import { pendingRequest, type Reminder } from "@/lib/api-client/pending";
import { formatIsoDate } from "@/lib/dates";
import { deniedPath, ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";

async function loadReminders(): Promise<LoadOutcome<Reminder[]>> {
  const result = await pendingRequest("GET /reminders");
  if (result.kind === "ok") return { status: "ready", data: result.data.reminders };
  if (result.kind === "signed-out") return "signed-out";
  // The check itself failed (or the route is missing), so nothing is known either way.
  return { status: "failed", message: result.kind === "failed" ? result.message : FALLBACK_MESSAGE };
}

// The date of this card's reminder, or null when none is saved. The newest
// one, if the backend ever keeps more than one per card.
function savedDateLabel(reminders: Reminder[], applicationId: string): string | null {
  const reminder = reminders
    .filter((r) => r.applicationId === applicationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return reminder ? formatIsoDate(reminder.remindOn) : null;
}

// Shows "Your reminder is saved" only after GET /reminders returns a reminder
// for this card, so an old or shared link never claims an email is coming.
// The date comes from the saved reminder, not from the address bar. A failed
// check says so and never claims the reminder is missing.
export function ReminderSavedCheck({ applicationId }: { applicationId: string }) {
  // The return-path allow-list does not include this page, so Home it is.
  const { loaded, retry } = useLoaded(loadReminders, signInPath(ROUTES.home));
  const dateLabel = loaded.status === "ready" ? savedDateLabel(loaded.data, applicationId) : null;

  if (dateLabel) return <ReminderSavedView dateLabel={dateLabel} />;

  return (
    <DeniedLayout backHref={ROUTES.home}>
      {loaded.status === "loading" ? (
        <p role="status" className="pt-5 text-center text-body-m text-indigo-black">
          Checking your reminder…
        </p>
      ) : loaded.status === "failed" ? (
        <>
          <div className="flex flex-col gap-2 pt-5">
            <h1 className="font-heading text-h1 font-medium text-navy">We couldn’t check your reminder</h1>
            <p className="text-body-m text-indigo-black">
              If you just saved it, it may still be set. Try again to check.
            </p>
          </div>
          <Button onClick={retry}>Try again</Button>
          <Link href={ROUTES.home} className={buttonVariants({ variant: "secondary" })}>
            Go to Home
          </Link>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2 pt-5">
            <h1 className="font-heading text-h1 font-medium text-navy">We couldn’t find a reminder</h1>
            <p className="text-body-m text-indigo-black">No reapply reminder is saved for this card, so no email is set.</p>
          </div>
          <Link href={deniedPath("reminder", applicationId)} className={buttonVariants()}>
            Set a reminder
          </Link>
          <Link href={ROUTES.home} className={buttonVariants({ variant: "secondary" })}>
            Go to Home
          </Link>
        </>
      )}
    </DeniedLayout>
  );
}
