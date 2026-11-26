// Created with Claude Code (2026-11-26). The one line that says what a secured
// card is, with "What is a secured card?" opening Penny's checked answer. Shown
// beside a secured card on Your match and on its page. No frame draws it: the
// Design System's Note line and text link. The link shows only to a signed-in
// student, since Ask Penny needs an account.
import Link from "next/link";

import { NoteLine } from "@/components/ui/note";
import { SECURED_LINE, SECURED_LINK } from "@/lib/copy/results";
import { pennyPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

// `from` is where Ask Penny's back arrow returns (lib/penny/navigation.ts):
// null leaves the link out.
export function SecuredNote({ from, className }: { from: string | null; className?: string }) {
  return (
    <NoteLine className={className}>
      {SECURED_LINE}
      {from !== null ? (
        <>
          {" "}
          {/* relative z-1: above a card-wide stretched link. A 44px tap area
              around the line (after:-inset-3.5). */}
          <Link
            href={pennyPath(SECURED_LINK.answerId, from)}
            className={cn(
              "relative z-1 whitespace-nowrap text-violet underline underline-offset-2 hover:text-violet-deep",
              "after:absolute after:-inset-3.5 focus-visible:outline-2 focus-visible:outline-ring",
            )}
          >
            {SECURED_LINK.label}
          </Link>
        </>
      ) : null}
    </NoteLine>
  );
}
