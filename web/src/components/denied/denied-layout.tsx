import type { ReactNode } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { cn } from "@/lib/utils";

// The frame around the rejection guide screens (Figma "Denial Overview").
// The frames draw a bookmark in the header; saving guides is not in MVP1, so
// it is left out rather than shown as a control that does nothing.
// contentClassName adjusts the content column for a frame that differs, such
// as the 16px gap on Denial options (144:1955).
export function DeniedLayout({
  backHref,
  backLabel,
  contentClassName,
  children,
}: {
  backHref: string;
  backLabel: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={backHref} backLabel={backLabel} />
        <main className={cn("stagger flex flex-1 flex-col gap-[18px] px-6 pt-4 pb-6", contentClassName)}>{children}</main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
