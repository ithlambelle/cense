import Handset from "@gravity-ui/icons/Handset";
import Shield from "@gravity-ui/icons/Shield";
import Link from "next/link";

import { DeniedLayout, withApplication } from "@/components/denied/denied-layout";
import { Notice, NumberedSteps } from "@/components/denied/parts";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

// Contact the issuer directly (Figma 397:2276, S25). The frame's "Call issuer
// customer service" button is left out: Cense does not know the number (the
// frame says to use the one in the letter), so the second look is the action.
// Reconsideration is described by issuers such as American Express
// (https://www.americanexpress.com/en-us/credit-cards/credit-intel/credit-card-reconsideration/);
// the copy does not present it as a right or promise an outcome.
export function FixableView({ applicationId }: { applicationId: string | null }) {
  return (
    <DeniedLayout backHref={withApplication(ROUTES.denied, applicationId)}>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 font-medium text-navy">Contact the issuer directly</h1>
        <p className="text-body-m text-indigo-black">
          If the letter or report shows incorrect personal information, income, or another fixable issue, customer
          service can explain how to correct it.
        </p>
      </div>
      <section className="flex flex-col gap-3 rounded-card border-[1.5px] border-violet p-5">
        <div className="flex items-center gap-2.5">
          <Handset aria-hidden="true" width={22} height={22} className="shrink-0 text-violet" />
          <div className="flex flex-col gap-[3px] text-indigo-black">
            <p className="text-body-s uppercase">Issuer customer service</p>
            <h2 className="font-heading text-h6 font-medium">Use the number in your letter</h2>
          </div>
        </div>
        <NumberedSteps
          steps={[
            "Say you’re calling about the denial notice and name the reason shown.",
            "Explain what looks incorrect and ask what proof they need.",
            "After it is corrected, ask whether they can take a second look at the same application.",
          ]}
        />
      </section>
      <Notice icon={Shield} title="A second look is not a new application">
        Ask whether another hard credit check is required before you agree to anything.
      </Notice>
      <Link href={withApplication(`${ROUTES.denied}/second-look`, applicationId)} className={buttonVariants()}>
        I requested a second look
      </Link>
      <p className="text-center text-body-s text-indigo-black">
        Keep the representative’s name, date, and confirmation number.
      </p>
    </DeniedLayout>
  );
}
