"use client";

import Lock from "@gravity-ui/icons/Lock";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PreviewLabel } from "@/components/safe-to-spend/parts";
import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { createLinkToken, linkBank } from "@/lib/api-client/safe-to-spend";
import { openLink } from "@/lib/plaid/link";
import { ROUTES, safeToSpendSetupPath, signInPath } from "@/lib/routes";
import { SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";
import { useIsMounted } from "@/lib/use-is-mounted";

const FAILED = "The bank connection didn’t finish. Please try again.";
const UNAVAILABLE = "We couldn’t open Plaid. Check your connection, then try again.";

type Note = { kind: "info" | "error"; text: string } | null;

// "Link a bank" (Figma 222:2041): what Cense reads and keeps, then Plaid Link
// in the sandbox. Link hands back a one-time public token; the server
// exchanges it and keeps the access token, so the browser never holds it.
export function ConnectView() {
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
    // Stays pending while the questions load.
    router.push(safeToSpendSetupPath());
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="flex flex-1 flex-col gap-4 px-6 pt-4 pb-6">
          <p className="flex items-center gap-2">
            <PreviewLabel />
            <span className="text-[13px] leading-[18px] text-indigo-black/75">{SAFE_TO_SPEND_COPY.sandboxNote}</span>
          </p>
          <Image src="/mascot/astro-pig/avatar.png" alt="" width={64} height={64} priority />
          <h1 className="font-heading text-h3 font-medium text-navy">{SAFE_TO_SPEND_COPY.connectTitle}</h1>
          <ul aria-label="What Cense reads and keeps" className="flex flex-col gap-2.5 rounded-card border-[1.5px] border-off-white bg-white px-5 py-4">
            {SAFE_TO_SPEND_COPY.consent.map((line, index) => (
              <li key={line} className="flex items-start gap-2.5 text-body-s text-navy">
                <span aria-hidden="true" className="flex size-[18px] shrink-0 items-center justify-center pt-0.5">
                  {index === 0 ? (
                    <Lock width={18} height={18} className="text-navy" />
                  ) : (
                    <Image src="/icons/fit-check.svg" alt="" width={14} height={11} />
                  )}
                </span>
                <span>{line}</span>
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
            Connect (Preview)
          </Button>
          <Link
            href={ROUTES.home}
            className="min-h-11 content-center self-center text-body-s text-violet outline-none hover:text-violet-hover focus-visible:outline-2 focus-visible:outline-ring"
          >
            Not now
          </Link>
        </main>
      </div>
    </div>
  );
}
