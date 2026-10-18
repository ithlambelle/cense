"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { capture, type AnalyticsEvent, type EventProps } from "@/lib/analytics";

type TrackedLinkProps<E extends AnalyticsEvent> = ComponentProps<typeof Link> & { track: EventProps<E> };

// A Link that sends one event when tapped, for server-rendered screens.
export function TrackedLink<E extends AnalyticsEvent>({ track, onClick, ...props }: TrackedLinkProps<E>) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        capture(track.event, track.props);
        onClick?.(event);
      }}
    />
  );
}
