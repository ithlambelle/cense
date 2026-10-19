"use client";

import { useEffect, useRef } from "react";

import { track, type AnalyticsEvent, type EventProps } from "@/lib/analytics";

// Sends one event when a server-rendered screen is shown. Renders nothing.
export function TrackOnMount<E extends AnalyticsEvent>({ event, props }: EventProps<E>) {
  const sent = useRef(false);
  const latest = useRef({ event, props } as EventProps<E>);
  useEffect(() => {
    // Once per mount, also under Strict Mode's double effect in development.
    if (sent.current) return;
    sent.current = true;
    sendEvent(latest.current);
  }, []);
  return null;
}

// track() checks the properties against the catalog at runtime; EventProps
// already pairs them with the event, which TypeScript cannot narrow here.
export function sendEvent<E extends AnalyticsEvent>({ event, props }: EventProps<E>): void {
  (track as (event: AnalyticsEvent, props?: object) => void)(event, props);
}
