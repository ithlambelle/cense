"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DeniedLayout, withApplication } from "@/components/denied/denied-layout";
import { ReminderSavedView } from "@/components/denied/reminder-saved-view";
import { buttonVariants } from "@/components/ui/button";
import { pendingRequest } from "@/lib/api-client/pending";
import { formatIsoDate } from "@/lib/dates";
import { ROUTES, signInPath } from "@/lib/routes";

type State = { kind: "checking" } | { kind: "saved"; dateLabel: string } | { kind: "missing" };

// Shows "Your reminder is saved" only after GET /reminders returns a reminder
// for this card, so an old or shared link never claims an email is coming.
// The date comes from the saved reminder, not from the address bar.
export function ReminderSavedCheck({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let active = true;
    void pendingRequest("GET /reminders").then((result) => {
      if (!active) return;
      if (result.kind === "signed-out") {
        router.replace(signInPath(ROUTES.home));
        return;
      }
      const reminder = result.kind === "ok" ? result.data.reminders.find((r) => r.applicationId === applicationId) : undefined;
      const dateLabel = reminder ? formatIsoDate(reminder.remindOn) : null;
      setState(dateLabel ? { kind: "saved", dateLabel } : { kind: "missing" });
    });
    return () => {
      active = false;
    };
  }, [applicationId, router]);

  if (state.kind === "saved") return <ReminderSavedView dateLabel={state.dateLabel} />;

  return (
    <DeniedLayout backHref={ROUTES.home}>
      {state.kind === "checking" ? (
        <p role="status" className="pt-5 text-center text-body-m text-indigo-black">
          Checking your reminder…
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 pt-5">
            <h1 className="font-heading text-h1 font-medium text-navy">We couldn’t find a reminder</h1>
            <p className="text-body-m text-indigo-black">No reapply reminder is saved for this card, so no email is set.</p>
          </div>
          <Link href={withApplication(`${ROUTES.denied}/reminder`, applicationId)} className={buttonVariants()}>
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
