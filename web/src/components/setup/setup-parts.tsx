// Created with Claude Code (2026-11-08). Pieces shared by the card setup and
// autopay screens (US-10, Figma Design Edits, Flow C 477:1493), drawn from the
// Design System parts those frames use: List row Divider (371:3100), the
// handoff strip, Info callout Neutral (371:3444).

import ChevronRight from "@gravity-ui/icons/ChevronRight";
import StarFill from "@gravity-ui/icons/StarFill";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { cn } from "@/lib/utils";

// Every setup screen: the one back arrow, then the content column with 24px
// sides, 12px above, 24px below and 16px between items (477:1574).
export function SetupScreen({ back, children }: { back: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={back.href} backLabel={back.label} />
        <main className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">{children}</main>
      </div>
    </div>
  );
}

// The big heading (Sora 32/40, navy). Sora is loaded at Medium only (G5).
export function SetupHeading({ children, size = "h1" }: { children: ReactNode; size?: "h1" | "h3" }) {
  return <h1 className={cn("font-heading font-medium text-navy", size === "h1" ? "text-h1" : "text-h3")}>{children}</h1>;
}

// Pushes what follows to the bottom of the screen (the frames' Spacer).
export function Spacer() {
  return <div aria-hidden="true" className="min-h-0 flex-1" />;
}

// "Cense, issuer, Done" (477:1621): where the student is in the hand-off.
// "issuer" while at the issuer's steps, "confirm" on the way back, "done" once saved.
export function HandoffStrip({ issuer, stage }: { issuer: string; stage: "issuer" | "confirm" | "done" }) {
  const label = "text-[12px] leading-4 font-semibold whitespace-nowrap uppercase";
  return (
    <ol aria-label="Steps" className="flex w-full items-center gap-2">
      <li className={cn(label, "text-navy")}>Cense</li>
      <li aria-hidden="true" className="h-0.5 min-w-px flex-1 bg-violet" />
      <li aria-current={stage === "issuer" ? "step" : undefined} className={cn(label, stage === "issuer" ? "text-violet" : "text-navy")}>
        {issuer}
      </li>
      <li aria-hidden="true" className={cn("h-0.5 min-w-px flex-1", stage === "issuer" ? "bg-off-white" : "bg-violet")} />
      <li
        aria-current={stage === "confirm" ? "step" : undefined}
        // The frame's 50% fails WCAG contrast at 12px (axe): 70%, the secondary text tone.
        className={cn(label, stage === "issuer" ? "text-indigo-black/70" : stage === "confirm" ? "text-violet" : "text-navy")}
      >
        Done
      </li>
    </ol>
  );
}

// Info callout, Neutral (371:3444): off-white, the document icon, a title and a line.
export function InfoCallout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-start gap-3 rounded-button bg-off-white p-4">
      <Image src="/icons/document.svg" alt="" width={20} height={20} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
        <p className="text-[15px] leading-[normal] font-semibold text-indigo-black">{title}</p>
        <p className="text-body-s leading-[normal] text-indigo-black/70">{children}</p>
      </div>
    </div>
  );
}

// The star at the front of a setup row: an empty ring, or lit (Lead / done).
function StarLead({ lit }: { lit: boolean }) {
  return lit ? (
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-amber text-white">
      <StarFill width={13} height={13} />
    </span>
  ) : (
    <span aria-hidden="true" className="size-6 shrink-0 rounded-pill border-[1.5px] border-indigo-black" />
  );
}

const ROW = "relative flex w-full gap-3 border-b border-off-white py-3.5 text-left";
const ROW_LINK = "hover:bg-off-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// List row, Divider, Star slot (371:3101 Default, 371:3117 Done): the whole
// row opens `href`. Done keeps the chevron off, as the frame does.
export function StarRow({
  title,
  subtitle,
  done,
  href,
}: {
  title: string;
  subtitle: string;
  done: boolean;
  href: string;
}) {
  return (
    <Link href={href} className={cn(ROW, ROW_LINK, "items-center")}>
      <StarLead lit={done} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
        <span className={cn("text-body-m leading-[normal]", done ? "text-indigo-black/70" : "font-medium text-indigo-black")}>
          {title}
          {done ? <span className="sr-only">, done</span> : null}
        </span>
        <span className="text-body-s leading-[normal] text-indigo-black/70">{subtitle}</span>
      </span>
      {done ? null : <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-indigo-black" />}
    </Link>
  );
}

// List row, Divider, Up next (371:3109): "UP NEXT", the title, a line and the
// action link, which is the row's only control.
export function UpNextRow({ title, subtitle, action, href }: { title: string; subtitle: string; action: string; href: string }) {
  return (
    <div className={cn(ROW, "items-start")}>
      <StarLead lit={false} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 leading-[normal]">
        <p className="text-[11px] leading-[normal] font-semibold text-violet">UP NEXT</p>
        <p className="text-body-m leading-[normal] font-medium text-indigo-black">{title}</p>
        <p className="text-body-s leading-[normal] text-indigo-black/70">{subtitle}</p>
        <Link
          href={href}
          className="relative self-start text-body-s leading-[normal] font-semibold text-violet underline underline-offset-2 after:absolute after:-inset-3 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
        >
          {action}
        </Link>
      </div>
    </div>
  );
}

// List row, Divider, Number (371:3126): one of the issuer's steps.
export function NumberRow({ number, title, subtitle }: { number: number; title: string; subtitle: string }) {
  return (
    <li className={cn(ROW, "items-center")}>
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-[14px] bg-light-blue/50 text-[13px] leading-[normal] font-semibold text-indigo-black"
      >
        {number}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
        <span className="text-body-m leading-[normal] font-medium text-indigo-black">{title}</span>
        <span className="text-body-s leading-[normal] text-indigo-black/70">{subtitle}</span>
      </span>
    </li>
  );
}
