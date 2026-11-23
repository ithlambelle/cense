"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PreviewLabel } from "@/components/safe-to-spend/parts";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { ListRowText } from "@/components/ui/list-row";
import { createLinkToken, linkBank } from "@/lib/api-client/safe-to-spend";
import { openLink } from "@/lib/plaid/link";
import { ROUTES, safeToSpendSetupPath, signInPath } from "@/lib/routes";
import { SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

import styles from "./connect-view.module.css";

const FAILED = "The bank connection didn’t finish. Please try again.";
const UNAVAILABLE = "We couldn’t open Plaid. Check your connection, then try again.";

type Note = { kind: "info" | "error"; text: string } | null;

// "Link your bank" (Flow 5 C1, Figma 821:9643; the same screen as Flow 1 E1,
// 821:8502): what Cense reads and keeps, then Plaid Link in the sandbox. Link
// hands back a one-time public token; the server exchanges it and keeps the
// access token, so the browser never holds it.
//
// `firstLogin` is E1, the third beat of first sign-in (Flow 1, 821:8502):
// the same screen, but Skip for now goes to Your next step without a bank
// (N3, 821:8701) instead of Home, and it arrives from the welcome as drawn:
// Penny shrinks into the corner as the screen slides up (CSS only; still
// with reduced motion). Linking goes where it always does, the questions.
export function ConnectView({ firstLogin = false }: { firstLogin?: boolean }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<Note>(null);

  async function connect() {
    if (pending) return;
    setPending(true);
    setNote(null);
    const done = (next: Note) => {
      if (!isMounted()) return;
      setPending(false);
      setNote(next);
    };

    const token = await createLinkToken();
    if (token.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpendConnect));
    if (token.kind === "failed") {
      if (token.code === "already_linked") return router.replace(ROUTES.safeToSpend);
      return done({ kind: "error", text: token.message });
    }

    const outcome = await openLink(token.data.linkToken);
    if (outcome.kind === "cancelled") return done({ kind: "info", text: "No bank connected. Try again when you’re ready." });
    if (outcome.kind === "failed") return done({ kind: "error", text: FAILED });
    if (outcome.kind === "unavailable") return done({ kind: "error", text: UNAVAILABLE });

    const linked = await linkBank(outcome.publicToken);
    if (linked.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpendConnect));
    if (linked.kind === "failed") {
      if (linked.code === "already_linked") return router.replace(ROUTES.safeToSpend);
      return done({ kind: "error", text: linked.message });
    }
    // Stays pending while the questions load. Replace: the bank is linked, so
    // Back never returns to this finished screen.
    router.replace(safeToSpendSetupPath());
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        {/* App header (821:9651): Penny's small avatar (371:3344) on the light
            blue tint, as drawn, with no back arrow: Skip for now leaves. */}
        <header className="box-content flex h-12 items-center px-6 pt-8">
          <Image
            src="/mascot/astro-pig/avatar.png"
            alt=""
            width={32}
            height={32}
            priority
            className={cn("size-8 shrink-0 rounded-pill bg-light-blue/50", firstLogin && styles.pennyLands)}
          />
        </header>
        <main className={cn("flex flex-1 flex-col gap-4 px-6 pt-3 pb-6", firstLogin && styles.slidesUp)}>
          <h1 className="font-heading text-h1 font-medium text-navy">{SAFE_TO_SPEND_COPY.connectTitle}</h1>
          <p className="text-body-m text-indigo-black">{SAFE_TO_SPEND_COPY.connectBody}</p>
          {/* Three List rows, Divider, no chevron (371:3199). */}
          <ul aria-label="What Cense reads and keeps" className="flex flex-col gap-4">
            {SAFE_TO_SPEND_COPY.consent.map((row) => (
              <li key={row.title} className="flex items-center gap-3 border-b border-off-white py-3.5">
                <ListRowText title={row.title} subtitle={row.body} />
              </li>
            ))}
          </ul>
          <div className="flex-1" />
          {note?.kind === "error" ? <ErrorMessage>{note.text}</ErrorMessage> : null}
          {note?.kind === "info" ? (
            <p role="status" className="text-body-s text-indigo-black">
              {note.text}
            </p>
          ) : null}
          <Button type="button" pending={pending} onClick={connect}>
            {SAFE_TO_SPEND_COPY.connectAction}
          </Button>
          {/* Button, Text (821:9661): 36 tall, 12px insets, at the left edge.
              On first sign-in it opens N3, so skipping still gets a next step.
              The tap area reaches 4px above and below it (after:-inset-y-1),
              so it is 44px tall while it looks as drawn. */}
          <Link
            href={firstLogin ? ROUTES.startNextStep : ROUTES.home}
            className={cn(
              buttonVariants({ variant: "secondary", size: null }),
              "relative h-9 self-start px-3 after:absolute after:inset-x-0 after:-inset-y-1"
            )}
          >
            {SAFE_TO_SPEND_COPY.connectSkip}
          </Link>
          {/* The frame's footer (821:9662), without its Privacy Policy line
              until a public policy page exists. Preview and the sandbox note
              stay until real bank data is live; they sit here, in the
              footer's own type, so the rest of the frame is as drawn. */}
          <div className="flex flex-col text-[13px] leading-[18px] text-indigo-black/70">
            <p>{SAFE_TO_SPEND_COPY.securedBy}</p>
            <p className="flex items-center gap-2">
              <PreviewLabel className="leading-[18px]" />
              <span>{SAFE_TO_SPEND_COPY.sandboxNote}</span>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
