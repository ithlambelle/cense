import Calendar from "@gravity-ui/icons/Calendar";
import Check from "@gravity-ui/icons/Check";
import Link from "next/link";

import { DeniedLayout } from "@/components/denied/denied-layout";
import { OutcomeMark } from "@/components/denied/parts";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

// Your reminder is saved (Figma 144:2196, was 397:2323, S24). Rendered by
// ReminderSavedCheck only once the reminder is found, so it can say a
// reminder will come (D8). The "Rejected card settings" box is gone (C8).
export function ReminderSavedView({ dateLabel }: { dateLabel: string }) {
  return (
    <DeniedLayout backHref={ROUTES.home} backLabel="Home">
      <div className="flex flex-col items-center gap-[18px] pt-5 text-center">
        <OutcomeMark icon={Check} tone="success" />
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-h1 font-medium text-navy">Your reminder is saved</h1>
          <p className="text-body-m text-indigo-black">
            We’ll remind you to review your progress before you consider applying again.
          </p>
        </div>
      </div>
      <section className="flex flex-col gap-3 rounded-card border-[1.5px] border-violet p-5">
        <div className="flex items-center gap-3">
          <Calendar aria-hidden="true" width={28} height={28} className="shrink-0 text-violet" />
          <div className="flex flex-col gap-[3px] text-indigo-black">
            <p className="text-body-s uppercase">Reapply check-in</p>
            <p className="font-heading text-h5 font-medium">{dateLabel}</p>
          </div>
        </div>
        <div className="h-px bg-off-white" />
        <p className="text-body-s text-indigo-black">
          Check reports, review on-time history, and use a preapproval check before a full application.
        </p>
      </section>
      <Link href={ROUTES.home} className={buttonVariants()}>
        Done
        <ButtonChevron />
      </Link>
    </DeniedLayout>
  );
}
