import FileText from "@gravity-ui/icons/FileText";
import Image from "next/image";

import { TrackedLink } from "@/components/analytics/tracked-link";
import { DeniedLayout } from "@/components/denied/denied-layout";
import { Notice } from "@/components/denied/parts";
import { choiceRowClass } from "@/components/ui/choice-row";
import { deniedPath, ROUTES, type DeniedStep } from "@/lib/routes";

// The frame's two buttons ("Show my 5 next steps", "I found a fixable reason")
// became one question (Ben, 2026-10-17): "fixable reason" meant nothing to a
// student, and the issuer's letter can take up to 30 days (Regulation B, 12 CFR
// 1002.9(a)(1)), so many students can't judge the reason yet. Only "something
// looks wrong" leads to asking the issuer for a second look.
const LETTER_CHOICES: { label: string; step: DeniedStep; choice: "looks_right" | "no_letter" | "looks_wrong" }[] = [
  { label: "Yes, it looks right", step: "plan", choice: "looks_right" },
  { label: "I don’t have the letter yet", step: "plan", choice: "no_letter" },
  { label: "Something looks wrong", step: "fixable", choice: "looks_wrong" },
];

// Denial Options (Figma 458:129), the start of the rejection guide (S21).
export function DeniedOptionsView({ applicationId }: { applicationId: string | null }) {
  return (
    <DeniedLayout backHref={ROUTES.home}>
      <h1 className="text-center font-heading text-h1 font-medium text-navy">Denial Options</h1>
      <div className="flex justify-center p-2.5">
        <Image src="/mascot/penny.png" alt="" width={214} height={214} className="rotate-[0.84deg]" priority />
      </div>
      <p className="text-body-m text-indigo-black">
        A common reason first applications are denied is that lenders can’t see enough history yet. We’ll help you check the
        reason before you do anything else.
      </p>
      <Notice icon={FileText} title="“No credit file” is not a mistake">
        It usually means the credit bureau doesn’t have a record for you yet. That’s common for students and isn’t a mark against you. If you have used credit before, check that your details were entered correctly.
      </Notice>
      <section aria-labelledby="letter-question" className="flex flex-col gap-3 pt-2">
        <h2 id="letter-question" className="font-heading text-h5 font-medium text-navy">
          Does the reason in the issuer’s letter look right?
        </h2>
        <ul className="flex flex-col gap-3">
          {LETTER_CHOICES.map((choice) => (
            <li key={choice.label}>
              <TrackedLink
                href={deniedPath(choice.step, applicationId)}
                className={choiceRowClass}
                track={{ event: "denial_letter_choice", props: { choice: choice.choice } }}
              >
                {choice.label}
              </TrackedLink>
            </li>
          ))}
        </ul>
      </section>
    </DeniedLayout>
  );
}
