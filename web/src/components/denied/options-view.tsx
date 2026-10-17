import FileText from "@gravity-ui/icons/FileText";
import Image from "next/image";
import Link from "next/link";

import { DeniedLayout, withApplication } from "@/components/denied/denied-layout";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

// Denial Options (Figma 458:129), the start of the rejection guide (S21).
export function DeniedOptionsView({ applicationId }: { applicationId: string | null }) {
  return (
    <DeniedLayout backHref={ROUTES.home}>
      <h1 className="text-center font-heading text-h1 font-medium text-navy">Denial Options</h1>
      <div className="flex justify-center p-2.5">
        <Image src="/mascot/penny.png" alt="" width={214} height={214} className="rotate-[0.84deg]" priority />
      </div>
      <p className="text-body-m text-indigo-black">
        First applications are often denied because lenders cannot see enough history yet. We’ll help you check the
        reason before you do anything else.
      </p>
      <section className="flex gap-3 rounded-input bg-off-white p-4">
        <FileText aria-hidden="true" width={22} height={22} className="mt-0.5 shrink-0 text-violet" />
        <div className="flex flex-col gap-1 text-indigo-black">
          <h2 className="font-heading text-h6 font-medium">“No credit file” is not a mistake</h2>
          <p className="text-body-s">
            It usually means there isn’t enough credit history to score yet, not that you did something wrong.
          </p>
        </div>
      </section>
      <div className="flex flex-col gap-2 pt-2">
        <Link href={withApplication(`${ROUTES.denied}/plan`, applicationId)} className={buttonVariants()}>
          Show my 5 next steps
        </Link>
        <Link href={withApplication(`${ROUTES.denied}/fixable`, applicationId)} className={buttonVariants({ variant: "secondary" })}>
          I found a fixable reason
        </Link>
      </div>
    </DeniedLayout>
  );
}
