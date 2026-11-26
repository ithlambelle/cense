"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { preload } from "react-dom";

import { StarField, type WelcomeStage } from "@/components/first-login/star-field";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { ROUTES } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

import styles from "./welcome.module.css";

// Created with Claude Code (2026-11-19). The first sign-in welcome (Flow 1,
// Figma 821:8408), shown once to a new student by /start.
// W1 (821:8422): Penny floats in while the stars light one by one, then
// "We're so glad you're here!". About 1.5 seconds later it moves on to W2 by
// itself, and a tap anywhere moves on sooner.
// W2 (821:8466): Penny's thumbs up, one line on what comes next, and "Let's
// go". W2 never moves on by itself (Ben, on the W2 card): the student reads
// at their own pace. "Let's go" saves that the welcome is done
// (PUT /me/welcome) before it moves on, so the welcome never comes back, then
// opens Link your bank (E1), or Your next step where the student cannot link
// a bank, and W2's line says which.

export const ADVANCE_MS = 1500;

export const WELCOME_COPY = {
  helloTitle: "We’re so glad you’re here!",
  // The frame says "Hi Maya, I'm Penny." Cense never asks for a name (sign-up
  // takes only an email), so Penny says hi without one.
  helloLine: "Hi, I’m Penny.",
  goTitle: "Let’s make money make Cense!",
  goLine: "First, link your bank so I can find your next step.",
  // When "Let's go" leads to Your next step instead (no bank to link: safe to
  // spend is off, or, with real banks, the student is not in the pilot).
  goLineNoBank: "First, let’s find your next step.",
  goAction: "Let’s go",
} as const;

const HELLO_ART = { src: "/mascot/astro-pig/hello.png", srcSet: "/mascot/astro-pig/hello.png 1x, /mascot/astro-pig/hello@2x.png 2x" };
const GO_ART = { src: "/mascot/astro-pig/thumbs-up.png", srcSet: "/mascot/astro-pig/thumbs-up.png 1x, /mascot/astro-pig/thumbs-up@2x.png 2x" };

// `next` is where "Let's go" leads, decided on the server.
export function WelcomeFlow({ next }: { next: string }) {
  const [stage, setStage] = useState<WelcomeStage>("hello");

  // W2's art loads while W1 plays, so Penny's thumbs up is ready on time.
  preload(GO_ART.src, { as: "image", imageSrcSet: GO_ART.srcSet, fetchPriority: "low" });

  useEffect(() => {
    if (stage !== "hello") return;
    const timer = setTimeout(() => setStage("go"), ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  return (
    <div className="flex min-h-dvh justify-center bg-navy">
      <div className="relative flex w-full max-w-phone flex-col overflow-hidden">
        <StarField stage={stage} />
        {stage === "hello" ? <Hello onSkip={() => setStage("go")} /> : <LetsGo next={next} />}
      </div>
    </div>
  );
}

// The frames' content column: 32px of status bar, then 12px, 24px sides,
// 16px between items, centered between two equal spacers. Headings are
// balanced and lines kept from leaving one word alone, so they break where
// the frames do ("We're so glad / you're here!") with the app's Sora Medium.
const COLUMN = "relative flex flex-1 flex-col items-center gap-4 px-6 pt-11 pb-[max(1.5rem,env(safe-area-inset-bottom))]";

function Hello({ onSkip }: { onSkip: () => void }) {
  return (
    <main className={COLUMN}>
      <div className="flex-1" />
      {/* Penny (821:8426), 230 by 301: the astro pig, exported from the frame
          at 1x and 2x. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed art with its own 1x and 2x files */}
      <img
        src={HELLO_ART.src}
        srcSet={HELLO_ART.srcSet}
        alt=""
        width={230}
        height={301}
        fetchPriority="high"
        className={`h-[301px] w-[230px] max-w-none shrink-0 ${styles.pennyFloats}`}
      />
      <div className={`flex w-full flex-col items-center gap-4 text-center ${styles.wordsIn}`}>
        <h1 className="font-heading text-h1 font-medium text-balance text-white">{WELCOME_COPY.helloTitle}</h1>
        <p className="text-body-m leading-[normal] text-white/70">{WELCOME_COPY.helloLine}</p>
      </div>
      <div className="flex-1" />
      {/* A tap anywhere moves on (the W1 card). The whole screen is this one
          button, so it also works from a keyboard. */}
      <button
        type="button"
        aria-label="Continue"
        onClick={onSkip}
        className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-light-blue"
      />
    </main>
  );
}

function LetsGo({ next }: { next: string }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const heading = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // W1 is gone, and with it the button that may have had focus: the new
  // heading takes it, so a screen reader hears what changed.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  async function letsGo() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await apiRequest("put", "/me/welcome");
    if (!isMounted()) return;
    if (!result.ok) {
      if (isUnauthorized(result)) {
        router.replace(ROUTES.signIn);
        return;
      }
      setPending(false);
      setError(failureMessage(result));
      return;
    }
    // Saved first, then on, and stays pending while the next screen loads.
    // Replace: Back from Link your bank never returns to the welcome.
    router.replace(next);
  }

  return (
    <main className={COLUMN}>
      <div className="flex-1" />
      {/* Penny (821:8470), 220 by 187: the thumbs-up pose from the Penny
          page, exported from this frame's image fill at 1x and 2x. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed art with its own 1x and 2x files */}
      <img
        src={GO_ART.src}
        srcSet={GO_ART.srcSet}
        alt=""
        width={220}
        height={187}
        className={`h-[187px] w-[220px] max-w-none shrink-0 ${styles.pennyThumbsUp}`}
      />
      <div className={`flex w-full flex-col items-center gap-4 text-center ${styles.goIn}`}>
        <h1 ref={heading} tabIndex={-1} className="font-heading text-h1 font-medium text-balance text-white outline-none">
          {WELCOME_COPY.goTitle}
        </h1>
        <p className="text-body-m text-pretty text-white/70">
          {next === ROUTES.startLinkBank ? WELCOME_COPY.goLine : WELCOME_COPY.goLineNoBank}
        </p>
      </div>
      <div className="flex-1" />
      <div
        className={`flex w-full flex-col gap-4 ${styles.goIn}`}
        style={{ "--go-delay": "240ms" } as CSSProperties}
      >
        {error ? <ErrorMessage className="text-white">{error}</ErrorMessage> : null}
        <Button type="button" variant="onDark" pending={pending} onClick={letsGo}>
          {WELCOME_COPY.goAction}
        </Button>
      </div>
    </main>
  );
}
