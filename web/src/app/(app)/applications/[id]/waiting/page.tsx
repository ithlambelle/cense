import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/ui/app-header";
import { buttonVariants } from "@/components/ui/button";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationIdSchema } from "@/lib/api/schemas";
import { applicationPath, ROUTES, signInPath } from "@/lib/routes";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "Still waiting | CENSE" };

// "Not yet" from the mark-result screen (S19). No frame: built from the
// denial frames' parts and proposed to design. Facts are sourced:
// Regulation B, 12 CFR 1002.9(a)(1) (https://www.consumerfinance.gov/rules-policy/regulations/1002/9/);
// Capital One on review times (https://www.capitalone.com/learn-grow/money-management/how-long-does-it-take-to-get-a-credit-card/).
export default async function WaitingPage({ params }: PageProps<"/applications/[id]/waiting">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  const application = await loadApplication(student, id);
  if (!application) notFound();

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={applicationPath(id)} title="Your application" />
        <main className="flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">Still waiting is normal</h1>
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
              Back to Home
            </Link>
            <Link href={applicationPath(id)} className={buttonVariants({ variant: "secondary" })}>
              I heard back
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
