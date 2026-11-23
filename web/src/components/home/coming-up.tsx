import Link from "next/link";

import { LIST_ROW, ListRowChevron, ListRowText } from "@/components/ui/list-row";
import { SENSITIVE } from "@/lib/analytics";
import { ROUTES } from "@/lib/routes";
import type { ComingUpRow } from "@/lib/home/coming-up";
import { cn } from "@/lib/utils";

// Created with Claude Code (2026-11-19). Coming up on Home (Figma D1,
// 709:1482 to 709:1486): an 18px Sora heading in Deep navy, then up to four
// List rows (Divider, 371:3199) 16px apart, each opening where its date is set.
// Nothing at all when there is nothing ahead: no empty state. The frame sets
// the heading in Sora SemiBold; Sora is loaded at Medium only, the typography
// frame's heading weight (app/layout.tsx), so a 600 would be a faked bold.
export function ComingUp({ rows }: { rows: ComingUpRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="coming-up" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="coming-up" className="font-heading text-h5 font-medium text-navy">
          Coming up
        </h2>
        {/* The Calendar's way in from Home (C1, 821:9284, "Taps 'See calendar'"),
            styled as the frames' "See all" link (709:2244): Inter 13, Violet. */}
        <Link
          href={ROUTES.calendar}
          className="flex min-h-11 items-center text-[13px] leading-[18px] text-violet hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          See calendar
        </Link>
      </div>
      <ul aria-labelledby="coming-up" className="flex flex-col gap-4">
        {rows.map((row) => (
          <li key={row.key}>
            {/* Amounts are the student's money: masked in session replay. */}
            <Link href={row.href} className={cn(LIST_ROW, row.sensitive && SENSITIVE)}>
              {/* Two spaces between the date and what happens, as drawn. */}
              <ListRowText title={<span className="whitespace-pre-wrap">{row.title}</span>} subtitle={row.subtitle} />
              <ListRowChevron />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
