import ChevronRight from "@gravity-ui/icons/ChevronRight";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Created with Claude Code (2026-11-15), moved from Profile so Profile and the
// Cards tab share one List row and one section heading.

// List row, Divider (Figma 371:3199): 14px above and below, a 1px off-white
// line under it. Put it on the row's link.
const LIST_ROW =
  "flex items-center gap-3 border-b border-off-white py-3.5 hover:bg-off-white/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

// The List row's two lines (371:3208): Inter Medium 16, then Inter 14 at 70%,
// 3px apart.
function ListRowText({ title, subtitle, subtitleClassName }: { title: ReactNode; subtitle?: ReactNode; subtitleClassName?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
      <span className="text-body-m leading-[normal] font-medium text-indigo-black">{title}</span>
      {subtitle ? (
        <span className={cn("text-body-s leading-[normal] text-indigo-black/70", subtitleClassName)}>{subtitle}</span>
      ) : null}
    </span>
  );
}

// The List row's chevron (371:3211), 16px.
function ListRowChevron() {
  return <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-indigo-black" />;
}

// Section headings (Figma 477:2809, 2813, 2815): Inter Semi Bold 16, Deep navy.
function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-body-m font-semibold text-navy">
      {children}
    </h2>
  );
}

export { LIST_ROW, ListRowChevron, ListRowText, SectionHeading };
