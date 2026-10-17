import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { ROUTES } from "@/lib/routes";

const backControl =
  "flex h-12 w-[88px] items-center rounded-pill outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress";

export function BackLinkHome() {
  return <BackLinkTo href={ROUTES.welcome} />;
}

export function BackLinkTo({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className={backControl}>
      <Image src="/icons/back-arrow.svg" alt="" width={33} height={33} />
    </Link>
  );
}

export function BackButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="Back" className={backControl}>
      <Image src="/icons/back-arrow.svg" alt="" width={33} height={33} />
    </button>
  );
}

// The page frame shared by the auth screens: back control, then a Sora title
// with the amber star beside it, as drawn.
export function AuthLayout({ title, back, children }: { title: string; back: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main className="flex w-full max-w-phone flex-col px-6 pt-8 pb-6">
        {back}
        <div className="flex flex-col gap-4 pt-3">
          <div className="flex items-center gap-1">
            <h1 className="font-heading text-h2 font-medium text-navy">{title}</h1>
            <Image src="/decor/star-large.svg" alt="" width={23} height={22} className="rotate-[17.75deg]" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

