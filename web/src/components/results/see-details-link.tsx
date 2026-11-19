// Created with Claude Code (2026-11-18). "See details" on Your match (Figma
// 821:9240, the design system's Link button 371:2823: 44 tall, full width,
// Amethyst label at 15, centered). It opens the card page, and its box is
// stretched over the whole card (after:inset-0), the block-link pattern: in
// interviews a student waited instead of tapping the link (2026-10-18), so the
// whole card opens it. One link per card rather than a link wrapping all its
// text. Shared by the server-rendered options and the client top match.
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { SEE_DETAILS } from "@/lib/copy/results";
import { cn } from "@/lib/utils";

export function SeeDetailsLink({ href, cardName }: { href: string; cardName: string }) {
  return (
    // translate-none: a pressed nudge would make the link the box its ::after
    // is sized to, shrinking the card-wide tap area mid-tap.
    <Link
      href={href}
      aria-label={`${SEE_DETAILS}: ${cardName}`}
      className={cn(
        buttonVariants({ variant: "secondary" }),
        "after:absolute after:inset-0 after:rounded-card motion-safe:active:translate-none",
      )}
    >
      {SEE_DETAILS}
    </Link>
  );
}
