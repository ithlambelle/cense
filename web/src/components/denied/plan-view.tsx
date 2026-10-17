import Link from "next/link";

import { DeniedLayout, withApplication } from "@/components/denied/denied-layout";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

type Step = { title: string; body: string; link?: { href: string; label: string } };

// From Figma 397:2407. Step 1 is reworded: the frame says "Review the reason
// and instructions within 30 days", which reads as a deadline for the student.
// The 30 days is the issuer's and runs from a completed application, and the
// notice may give the reasons or the right to ask for them within 60 days:
// Regulation B, 12 CFR 1002.9(a)(1)(i) and (a)(2)
// (https://www.consumerfinance.gov/rules-policy/regulations/1002/9/). Step 2:
// AnnualCreditReport.com is the official free source and checking your own
// report does not hurt your score (CFPB,
// https://www.consumerfinance.gov/ask-cfpb/does-requesting-my-credit-report-hurt-my-credit-score-en-1229/).
const STEPS: Step[] = [
  {
    title: "Read the issuer’s letter",
    body: "The issuer has to send a written notice within 30 days of your completed application. It lists the reasons, or tells you how to ask for them (ask within 60 days).",
  },
  {
    title: "Check all three credit reports",
    body: "Use the official free source. Checking your own reports does not hurt your score.",
    link: { href: "https://www.annualcreditreport.com", label: "AnnualCreditReport.com" },
  },
  { title: "Pause new applications", body: "Hold off for now. Use a preapproval check first when you’re ready." },
  {
    title: "Build credit another way",
    body: "Compare a secured card, credit-builder loan, or authorized-user option. No “apply now” pressure.",
  },
  {
    title: "Reapply in about 6 months",
    // A rule of thumb, not an issuer rule: no primary source sets a waiting period.
    body: "Many people wait about 6 months so new on-time history can show. Then check preapproval before applying.",
  },
];

// A steady five-step plan (S22). The steps are a real sequence, so they are numbered.
export function DeniedPlanView({ applicationId }: { applicationId: string | null }) {
  return (
    <DeniedLayout backHref={withApplication(ROUTES.denied, applicationId)}>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 font-medium text-navy">A steady five-step plan</h1>
        <p className="text-body-m text-indigo-black">Take these in order. You do not need to solve everything today.</p>
      </div>
      <ol className="flex flex-col gap-3 rounded-card border-[1.5px] border-violet p-5">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-[26px] shrink-0 items-center justify-center rounded-pill bg-off-white font-number text-number-s text-violet"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px] text-indigo-black">
              <h2 className="font-heading text-h6 font-medium">{step.title}</h2>
              <p className="text-body-s">{step.body}</p>
              {step.link ? (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start text-body-s text-violet underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {step.link.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <Link href={withApplication(`${ROUTES.denied}/reminder`, applicationId)} className={buttonVariants()}>
          Set a 6-month reminder
        </Link>
        <p className="text-center text-body-s text-indigo-black">
          Next you’ll pick a date. Only a reapply reminder is set; no card plan or card reminders start.
        </p>
      </div>
    </DeniedLayout>
  );
}
