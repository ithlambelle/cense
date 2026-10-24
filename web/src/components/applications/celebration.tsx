"use client";

import Link from "next/link";
import { useEffect, type CSSProperties } from "react";

import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import { SENSITIVE } from "@/lib/analytics";
import type { Application } from "@/lib/api/application";
import { moneyAmount } from "@/lib/money";
import { applicationPath, ROUTES } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

// The frame's burst star (public/decor/burst-star.svg, Figma 144:1601) as a
// mask, so the one shape takes any brand color. Values below come from
// get_design_context for 144:1555.
const STAR = "mask-[url(/decor/burst-star.svg)] mask-contain mask-center mask-no-repeat";

// The burst from the frame (144:1555), in its 390-wide coordinates. Light blue
// is retired (global rule), so the frame's light-blue stars use the lavender
// outline color.
const BURST = [
  { x: 270, y: 69, size: 14, turn: -49, color: "bg-violet" },
  { x: 198, y: 37, size: 22, turn: -15, color: "bg-amber" },
  { x: 245, y: 29, size: 14, turn: 10, color: "bg-selected-outline" },
  { x: 302, y: 56, size: 12, turn: -20, color: "bg-selected-outline" },
  { x: 335, y: 36, size: 16, turn: 20, color: "bg-amber" },
  { x: 226, y: 76, size: 10, turn: 0, color: "bg-selected-outline" },
  { x: 163, y: 60, size: 18, turn: -30, color: "bg-violet" },
  { x: 373, y: 119, size: 10, turn: -10, color: "bg-amber" },
  { x: 4, y: 251, size: 12, turn: 15, color: "bg-selected-outline" },
  { x: 372, y: 296, size: 14, turn: -25, color: "bg-selected-outline" },
  { x: 4, y: 420, size: 10, turn: 0, color: "bg-amber" },
  { x: 372, y: 520, size: 12, turn: 0, color: "bg-selected-outline" },
] as const;

// Copy from the frame. Saving these steps is a later story.
const FIRST_MONTH = [
  { title: "Turn on autopay", detail: "Statement balance, every month" },
  { title: "Plan one purchase", detail: "A small cost you already budget for" },
  { title: "Set a payment reminder", detail: "Use the due date on your statement" },
] as const;

// The constellation panel is 299 wide in the frame; x is placed as a share of it.
const SKY_DOTS = [
  [18, 72],
  [120, 16],
  [200, 80],
  [276, 22],
  [60, 40],
  [236, 58],
] as const;

// Stars 2 and 3 of the constellation, by their centers.
const DIM_STARS = [
  [154.5, 34],
  [269, 52],
] as const;

const at = (x: number, y: number, width: number): CSSProperties => ({ left: `${(x / width) * 100}%`, top: y });

// Flow 1 step 2 (Figma 144:1555). Mark result opens it with `celebrate` right
// after an approval is saved: the stars burst in one CSS sequence (about 1.2s),
// Android phones give one short buzz, and the card shows today as the approval
// date. Reduced motion keeps the stars still and skips the buzz. The flag is
// then dropped from the address, so a reload or a later visit shows the calm
// screen without a date, since none is stored.
export function Celebration({ application, celebrate }: { application: Application; celebrate: boolean }) {
  const now = useNow();

  useEffect(() => {
    if (!celebrate) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("celebrate");
    window.history.replaceState(null, "", url.pathname + url.search);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // iPhone browsers have no vibration API; it is never required.
    if (!still && typeof navigator.vibrate === "function") navigator.vibrate(40);
  }, [celebrate]);

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="relative flex w-full max-w-phone flex-col overflow-x-clip">
        <div aria-hidden="true" className="box-content h-14 pt-8" />
        <main className="stagger flex flex-1 flex-col gap-4 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-1.5">
            <p className="min-h-5 text-body-s text-indigo-black uppercase" suppressHydrationWarning>
              {now ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : ""}
            </p>
            <h1 className="font-heading text-h1 font-medium text-navy">You’re approved!</h1>
            <p className="text-body-m text-indigo-black">Light all three stars this month.</p>
          </div>

          <section aria-label={application.cardName} className="flex flex-col gap-3.5 rounded-card border-[1.5px] border-violet bg-white p-5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="relative h-[38px] w-14 shrink-0 rounded-[6px] bg-navy">
                <span className="absolute top-[9px] left-[7px] h-2 w-[11px] rounded-[2px] bg-amber" />
                <span className="absolute top-[27px] left-[7px] h-[3px] w-[26px] rounded-[2px] bg-white/35" />
                {/* The frame's badge: white check on Light Green, white 2px edge. */}
                <span className="absolute -top-2 left-11 flex size-5 items-center justify-center rounded-pill border-2 border-white bg-green">
                  <span className="h-[8.25px] w-[10.5px] bg-white mask-[url(/icons/fit-check.svg)] mask-contain mask-center mask-no-repeat" />
                </span>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 className="font-heading text-h6 font-medium text-navy">{application.cardName}</h2>
                {celebrate && now ? (
                  <p className="text-[13px] leading-normal text-indigo-black/70" suppressHydrationWarning>
                    Approved {now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                ) : null}
              </div>
            </div>

            {application.creditLimitCents !== null ? (
              <div className="flex flex-col gap-0.5">
                <p className="text-body-s text-indigo-black">Credit limit</p>
                <div className="flex items-baseline gap-2">
                  <p className={cn(SENSITIVE, "flex-1 font-number text-[2.25rem] leading-[2.75rem] font-medium text-navy")}>
                    {moneyAmount(application.creditLimitCents)}
                  </p>
                  {/* A 44px tap area (after:-inset-3) that keeps the frame's 44px row. */}
                  <Link
                    href={applicationPath(application.id)}
                    aria-label="Edit credit limit"
                    className="relative text-body-s font-medium text-violet underline underline-offset-2 outline-none after:absolute after:-inset-3 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="h-[1.5px] bg-off-white" />
            <h2 className="font-heading text-h6 font-medium text-navy">Your first month</h2>

            <div className="relative h-[92px] overflow-hidden rounded-[16px] bg-navy">
              <svg aria-hidden="true" className="absolute inset-0 size-full" viewBox="0 0 299 92" preserveAspectRatio="none">
                <polyline
                  points="40,60 154.5,34 269,52"
                  fill="none"
                  className="stroke-off-white"
                  strokeOpacity={0.35}
                  strokeWidth={1.25}
                  strokeDasharray="2.9 4.9"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {SKY_DOTS.map(([x, y]) => (
                <span key={`${x}-${y}`} aria-hidden="true" className="absolute size-[2.5px] rounded-pill bg-white/35" style={at(x, y, 299)} />
              ))}
              <span aria-hidden="true" className="absolute size-[34px] -translate-1/2 rounded-pill bg-off-white/35" style={at(40, 60, 299)} />
              {/* Star 1 is next: white with a white glow. Stars 2 and 3 wait, dim. */}
              <span aria-hidden="true" className="absolute -translate-1/2 drop-shadow-[0_0_4px_rgb(255_255_255/0.7)]" style={at(40, 60, 299)}>
                <span className={cn(STAR, "block size-[19px] bg-white")} />
              </span>
              {DIM_STARS.map(([x, y]) => (
                <span key={x} aria-hidden="true" className="absolute -translate-1/2 drop-shadow-[0_0_2.5px_rgb(236_234_246/0.45)]" style={at(x, y, 299)}>
                  <span className={cn(STAR, "block size-2.5 bg-off-white/70")} />
                </span>
              ))}
              <p className="absolute top-2.5 left-3.5 text-caption leading-normal font-semibold text-off-white">0 of 3 lit</p>
            </div>

            <ul className="flex flex-col gap-3.5">
              {FIRST_MONTH.map((step) => (
                <li key={step.title} className="flex items-center gap-3 rounded-card bg-off-white px-3.5 py-2.5 text-indigo-black">
                  <span aria-hidden="true" className="size-6 shrink-0 rounded-pill border-[1.5px] border-indigo-black/70" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-body-m font-medium">{step.title}</span>
                    <span className="text-body-s">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <Link href={ROUTES.home} className={buttonVariants()}>
            Go to Home
          </Link>
        </main>
        {celebrate ? (
          <div aria-hidden="true" data-testid="burst" className="pointer-events-none absolute inset-0">
            {BURST.map((star, index) => (
              <span
                key={`${star.x}-${star.y}`}
                className={cn(STAR, star.color, "absolute animate-pop")}
                style={{
                  ...at(star.x, star.y, 390),
                  width: star.size,
                  height: star.size,
                  rotate: `${star.turn}deg`,
                  animationDelay: `${index * 80}ms`,
                }}
              />
            ))}
          </div>
        ) : null}
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
