import Check from "@gravity-ui/icons/Check";
import Link from "next/link";

import { OutcomeMark } from "@/components/denied/parts";
import { AppHeader } from "@/components/ui/app-header";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { deniedPath } from "@/lib/routes";

// Reminder saved (Flow F, F3, Figma 477:2655): the check alone, no Penny, and
// the confirmation email (F4) named. Rendered by ReminderSavedCheck only once
// the reminder is found, so it can say a reminder will come (D8). Back and
// "Back to your plan" both return to the plan and replace this entry (G1), so
// Back from the plan never reopens this screen or the form before it.
// `emailed` is true when this tab just saved it and the confirmation went out;
// opened again later, the screen says when the email will come instead.
export function ReminderSavedView({
  applicationId,
  dateLabel,
  emailed,
}: {
  applicationId: string | null;
  dateLabel: string;
  emailed: boolean;
}) {
  const plan = deniedPath("plan", applicationId);
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={plan} backLabel="Plan" replace />
        <main className="stagger flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
          <OutcomeMark icon={Check} tone="success" />
          <h1 className="font-heading text-h1 font-semibold text-navy">Reminder saved</h1>
          <p className="text-body-m text-indigo-black">
            {emailed ? "We emailed you a confirmation." : `We’ll email you on ${dateLabel}.`}
          </p>
          <section className="flex flex-col items-center gap-2 rounded-card border-[1.5px] border-violet bg-white p-5">
            <h2 className="text-[12px] leading-4 font-semibold text-violet uppercase">Reapply check-in</h2>
            <p className="w-full font-heading text-h6 font-semibold text-navy">{dateLabel}</p>
            <p className="w-full text-body-s text-indigo-black">
              Check reports, review on-time history, then try a preapproval check.
            </p>
          </section>
          <div className="flex-1" />
          <Link href={plan} replace className={buttonVariants()}>
            Back to your plan
            <ButtonChevron />
          </Link>
        </main>
      </div>
    </div>
  );
}
