"use client";

import { useCallback, useEffect, useRef } from "react";

// For a save that moves the student on when its answer arrives. Returns a
// check that is true only while the screen is still open, so a late answer
// never pulls a student who already left (for example through the bottom bar)
// back to the screen this one would have opened.
export function useIsMounted(): () => boolean {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
