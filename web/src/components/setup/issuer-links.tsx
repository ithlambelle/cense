"use client";

// Created with Claude Code (2026-11-08). I2's two link outs (477:1633,
// 477:1634): the issuer's app (its App Store listing, or Google Play on
// Android) and its site, each in a new tab, like the apply links. Cense's own
// tab moves on to "Did you turn on autopay?" (I3), so it is waiting when the
// student comes back.

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import type { Issuer } from "@/lib/cards/issuers";
import { cn } from "@/lib/utils";

export function IssuerLinks({ issuer, confirmHref }: { issuer: Issuer; confirmHref: string }) {
  const router = useRouter();
  const moveOn = () => router.push(confirmHref);

  // The App Store listing, or Google Play when the browser says Android
  // (decided at the tap: the server cannot tell).
  function openApp(event: MouseEvent<HTMLAnchorElement>) {
    if (/android/i.test(navigator.userAgent)) {
      event.preventDefault();
      window.open(issuer.playStoreUrl, "_blank", "noopener,noreferrer");
    }
    moveOn();
  }

  return (
    <>
      <a href={issuer.appStoreUrl} target="_blank" rel="noopener noreferrer" onClick={openApp} className={buttonVariants()}>
        Open the {issuer.name} app
        <ButtonChevron />
      </a>
      <a
        href={issuer.site.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={moveOn}
        className={cn(buttonVariants({ variant: "outline" }), "text-button text-violet")}
      >
        Open {issuer.site.label}
      </a>
    </>
  );
}
