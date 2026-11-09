import Clock from "@gravity-ui/icons/Clock";
import Link from "next/link";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

// Snoozed (Flow B N4, Figma 477:1394): when the reminder comes back, what
// happens until then, and what dismissing would have done instead. `day` is
// "tomorrow" or the weekday it comes back ("Tue").
export function SnoozedView({
  day,
  comesBack,
  deadline,
}: {
  day: string;
  comesBack: string;
  deadline: { label: string; date: string } | null;
}) {
  const rows: [string, string][] = [
    [`Until ${day}`, "Nothing from this reminder"],
    ["Comes back", comesBack],
    ...(deadline ? [[deadline.label, deadline.date] as [string, string]] : []),
  ];
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.updates} backLabel="Updates" />
        <main className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
          <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-pill border-[1.5px] border-violet bg-off-white text-violet">
            <Clock width={16} height={16} />
          </span>
          <h1 className="font-heading text-h1 font-medium text-navy">Snoozed until {day}</h1>
          <p className="text-body-m text-indigo-black">
            We will keep this out of the way. It comes back {day} morning.
          </p>
          <section aria-labelledby="next" className="flex flex-col gap-2 rounded-card border-[1.5px] border-violet bg-white p-5">
            <h2 id="next" className="font-heading text-h6 font-medium text-navy">What happens next</h2>
            <dl className="flex flex-col gap-2">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center gap-2 py-2 text-body-s">
                  <dt className="flex-1 text-indigo-black">{label}</dt>
                  <dd className="font-semibold text-navy">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="dismiss" className="flex flex-col gap-2 rounded-card border-[1.5px] border-dashed border-violet bg-off-white p-5">
            <h2 id="dismiss" className="font-heading text-h6 font-medium text-navy">If you dismiss instead</h2>
            <p className="text-body-s text-indigo-black">
              This reminder stays hidden for the rest of this billing cycle. The next statement starts fresh.
            </p>
          </section>
          <div className="flex-1" />
          <Link href={ROUTES.updates} className={buttonVariants({ variant: "outline", className: "text-violet text-button" })}>
            Back to Updates
          </Link>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
