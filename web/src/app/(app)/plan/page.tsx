import type { Metadata } from "next";
import Link from "next/link";

import { FirstMonthPlan } from "@/components/plan/first-month-plan";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { applicationParam } from "@/lib/denied";
import { planApplication } from "@/lib/home/state";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Your first-month plan | CENSE" };

// The plan is for the approved card in ?application= (Home links each one),
// or else the most recently approved card.
export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const student = await requireStudent(ROUTES.home);
  const { applications } = await loadStudentSnapshot(student);
  const approved = planApplication(applications, applicationParam((await searchParams).application));
  if (approved) return <FirstMonthPlan application={approved} />;

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="stagger flex flex-1 flex-col gap-4 px-6 pt-4 pb-6">
          <h1 className="font-heading text-h2 font-medium text-navy">No approved card yet</h1>
          <p className="text-body-m text-indigo-black">Your first-month plan starts when a card is approved. Update a card on Home when you hear back.</p>
          <Link href={ROUTES.home} className={buttonVariants()}>
            Go to Home
            <ButtonChevron />
          </Link>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
