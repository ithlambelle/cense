import FileText from "@gravity-ui/icons/FileText";
import Image from "next/image";
import Link from "next/link";

import { DeniedLayout, withApplication } from "@/components/denied/denied-layout";
import { ROUTES } from "@/lib/routes";

const choiceRow =
  "flex min-h-14 w-full items-center rounded-[18px] border-[1.5px] border-violet bg-white px-5 py-3 text-body-m text-navy outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// The frame's two buttons ("Show my 5 next steps", "I found a fixable reason")
// became one question (Ben, 2026-10-17): "fixable reason" meant nothing to a
// student, and the issuer's letter can take up to 30 days (Regulation B, 12 CFR
// 1002.9(a)(1)), so many students can't judge the reason yet. Only "something
// looks wrong" leads to asking the issuer for a second look.
const LETTER_CHOICES = [
  { label: "Yes, it looks right", href: `${ROUTES.denied}/plan` },
  { label: "I don’t have the letter yet", href: `${ROUTES.denied}/plan` },
  { label: "Something looks wrong", href: `${ROUTES.denied}/fixable` },
] as const;

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
      <section className="flex gap-3 rounded-input bg-off-white p-4">
        <FileText aria-hidden="true" width={22} height={22} className="mt-0.5 shrink-0 text-violet" />
        <div className="flex flex-col gap-1 text-indigo-black">
          <h2 className="font-heading text-h6 font-medium">“No credit file” is not a mistake</h2>
          <p className="text-body-s">
            It usually means the credit bureau doesn’t have a record for you yet. That’s common for students and isn’t a mark against you. If you have used credit before, check that your details were entered correctly.
          </p>
        </div>
      </section>
      <section aria-labelledby="letter-question" className="flex flex-col gap-3 pt-2">
        <h2 id="letter-question" className="font-heading text-h5 font-medium text-navy">
          Does the reason in the issuer’s letter look right?
        </h2>
        <ul className="flex flex-col gap-3">
          {LETTER_CHOICES.map((choice) => (
            <li key={choice.label}>
              <Link href={withApplication(choice.href, applicationId)} className={choiceRow}>
                {choice.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </DeniedLayout>
  );
}
