"use client";

import { useEffect, useRef } from "react";

import { capture, type AnalyticsEvent, type EventProps } from "@/lib/analytics";

// Sends one event when a server-rendered screen is shown. Renders nothing.
export function TrackOnMount<E extends AnalyticsEvent>({ event, props }: EventProps<E>) {
  const sent = useRef(false);
  const latest = useRef({ event, props });
  useEffect(() => {
    // Once per mount, also under Strict Mode's double effect in development.
    if (sent.current) return;
    sent.current = true;
    capture(latest.current.event, latest.current.props);
  }, []);
  return null;
}
