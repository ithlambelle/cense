import Handset from "@gravity-ui/icons/Handset";
import Shield from "@gravity-ui/icons/Shield";
import Link from "next/link";

import { DeniedLayout } from "@/components/denied/denied-layout";
import { CopyScript } from "@/components/denied/copy-script";
import { Notice, NumberedSteps } from "@/components/denied/parts";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { deniedPath } from "@/lib/routes";

// What to say on the call. "Copy script" copies these lines as they read here.
const SCRIPT_STEPS = [
  "Mention the denial and the reason.",
  "Say what’s wrong and ask what proof they need.",
  "Once it’s fixed, ask for a second look.",
];

// Consider contacting the issuer (Figma 144:2426, C12; was 397:2276, S25).
// No call button: Cense does not know the number, so the letter's number is
// named and the second look is the action. Reconsideration is described by
// issuers such as American Express
// (https://www.americanexpress.com/en-us/credit-cards/credit-intel/credit-card-reconsideration/);
// the copy does not present it as a right or promise an outcome.
export function FixableView({ applicationId }: { applicationId: string | null }) {
  return (
    <DeniedLayout backHref={deniedPath("options", applicationId)} backLabel="Denial options">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 font-medium text-navy">Consider contacting the issuer</h1>
        <p className="text-body-m text-indigo-black">
          Mistakes happen, like a typo in your name or income. A quick call can fix it.
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
        <NumberedSteps steps={SCRIPT_STEPS} />
        <CopyScript steps={SCRIPT_STEPS} />
      </section>
      <Notice icon={Shield} title="A second look isn’t a new application">
        Ask if it needs another hard credit check first.
      </Notice>
      <Link href={deniedPath("secondLook", applicationId)} className={buttonVariants()}>
        I requested a second look
        <ButtonChevron />
      </Link>
      <p className="text-center text-body-s text-indigo-black">Note the rep’s name, the date and a confirmation number.</p>
    </DeniedLayout>
  );
}
