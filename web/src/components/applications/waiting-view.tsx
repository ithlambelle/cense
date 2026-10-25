import Link from "next/link";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { MascotStill } from "@/components/mascot/mascot";
import type { Application } from "@/lib/api/application";
import { applicationPath, ROUTES } from "@/lib/routes";

// "Not yet" from the mark-result screen (S19). No frame: built from the
// denial frames' parts and proposed to design. Facts are sourced:
// Regulation B, 12 CFR 1002.9(a)(1) (https://www.consumerfinance.gov/rules-policy/regulations/1002/9/);
// Capital One on review times (https://www.capitalone.com/learn-grow/money-management/how-long-does-it-take-to-get-a-credit-card/).
export function WaitingView({ application }: { application: Application }) {
  const id = application.id;
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={applicationPath(id)} backLabel="Your application" />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-heading text-h2 font-medium text-navy">Still waiting is normal</h1>
              <MascotStill pose="idle" size={80} className="shrink-0" float />
            </div>
            <p className="text-body-m text-indigo-black">
              Not every application gets an answer right away. Here’s what to expect for {application.cardName}.
            </p>
          </div>
          <section className="flex flex-col gap-3 rounded-card bg-off-white p-5">
            <h2 className="font-heading text-h6 font-medium text-navy">How long it can take</h2>
            <p className="text-body-s text-indigo-black">
              Issuers that don’t decide on the spot review the application first. Capital One, for example, says this can
              take about 7 to 10 business days.
            </p>
            <p className="text-body-s text-indigo-black">
              By law, an issuer has to tell you its decision within 30 days of getting your completed application.
            </p>
          </section>
          <section className="flex flex-col gap-3 rounded-card border border-hairline p-5">
            <h2 className="font-heading text-h6 font-medium text-navy">While you wait</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body-s text-indigo-black marker:text-violet">
              <li>Watch your email and mail for the issuer’s answer.</li>
              <li>Hold off on other applications until you hear back.</li>
              <li>Come back and update your status when you know.</li>
            </ul>
          </section>
          <div className="mt-auto flex flex-col gap-3">
            <Link href={ROUTES.home} className={buttonVariants()}>
              Go to Home
              <ButtonChevron />
            </Link>
            <Link href={applicationPath(id)} className={buttonVariants({ variant: "secondary" })}>
              I heard back
            </Link>
          </div>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );

}
