"use client";

import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

import { BACK_CONTROL, BackLink } from "@/components/ui/app-header";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

// Auth screens use the app's one back control (G6): arrow only, named for screen readers.
export function BackLinkHome() {
  return <BackLink href={ROUTES.welcome} label="Welcome" />;
}

export function BackButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="Back" className={cn(BACK_CONTROL, "focus-visible:outline-ring")}>
      <Image src="/icons/arrow-left-dark.svg" alt="" width={48} height={48} />
    </button>
  );
}

// The page frame shared by the auth screens: back control, then a Sora title
// with the amber star beside it, as drawn. `focusTitle` moves focus to the
// title when a step replaces the one before it on the same page, so keyboard
// and screen reader users hear that the screen changed (WCAG 2.4.3).
export function AuthLayout({
  title,
  back,
  focusTitle = false,
  children,
}: {
  title: string;
  back: ReactNode;
  focusTitle?: boolean;
  children: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main className="stagger flex w-full max-w-phone flex-col px-6 pt-8 pb-6">
        {back}
        <div className="flex flex-col gap-4 pt-3">
          <div className="flex items-center gap-2">
            <h1 ref={titleRef} tabIndex={-1} className="font-heading text-h2 font-medium text-navy outline-none">
              {title}
            </h1>
            <Image src="/decor/star-large.svg" alt="" width={23} height={22} className="rotate-[17.75deg]" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

