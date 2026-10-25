import FileText from "@gravity-ui/icons/FileText";
import Image from "next/image";
import Link from "next/link";

import { DeniedLayout } from "@/components/denied/denied-layout";
import { Notice } from "@/components/denied/parts";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { deniedPath, ROUTES } from "@/lib/routes";

// "No problem" (Figma 144:2322, Flow 2 A1): the student is still waiting on the
// issuer's letter. Opened only after no_letter_yet is saved, so Home can pick
// up from here. One way on: back to Home.
export function NoLetterView({ applicationId }: { applicationId: string | null }) {
  return (
    <DeniedLayout backHref={deniedPath("options", applicationId)} backLabel="Denial options">
      <div className="flex justify-center">
        <Image src="/mascot/penny.png" alt="" width={170} height={170} priority />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 font-semibold text-navy">No problem</h1>
        <p className="text-body-m text-indigo-black">
          Letters can take up to 30 days. Tell us when yours comes, and we’ll turn the reason into your next steps.
        </p>
      </div>
      <Notice icon={FileText} title="Keep an eye on mail and email">
        The letter comes from the issuer. Keep it, and note the date it arrived.
      </Notice>
      <Link href={ROUTES.home} className={buttonVariants()}>
        Back to Home
        <ButtonChevron />
      </Link>
    </DeniedLayout>
  );
}
