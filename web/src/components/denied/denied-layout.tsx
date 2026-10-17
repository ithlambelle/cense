import type { ReactNode } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";

// The frame around the rejection guide screens (Figma "Denial Overview").
// The frames draw a bookmark in the header; saving guides is not in MVP1, so
// it is left out rather than shown as a control that does nothing.
export function DeniedLayout({ backHref, children }: { backHref: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={backHref} title="Denial Overview" />
        <main className="flex flex-1 flex-col gap-[18px] px-6 pt-4 pb-6">{children}</main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

// Keeps the tracked card with the student as they move through the guide.
export function withApplication(path: string, applicationId: string | null): string {
  return applicationId ? `${path}?application=${encodeURIComponent(applicationId)}` : path;
}
