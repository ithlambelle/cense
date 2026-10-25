"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ErrorMessage } from "@/components/ui/error-message";
import { Switch } from "@/components/ui/switch";
import { applyAnalyticsChoice, browserAsksNotToTrack } from "@/lib/analytics";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

type Props = {
  // From the profile; null when it could not be read.
  analyticsOn: boolean | null;
  studentId: string;
  isInternal: boolean;
};

// The browser's own signal never changes while the page is open.
const noSubscription = () => () => {};

// Security and privacy (the "Soon" row of Profile, Figma 222:2282). No frame:
// built in the parts of Reminder settings (222:2344), its sibling screen: the
// toggle card and the text action at the foot. The switch saves as it is
// flipped, to the profile, so it follows the student to every device; this
// browser applies it at once with PostHog's own opt-out.
export function PrivacyView({ analyticsOn: initial, studentId, isInternal }: Props) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const titleId = useId();
  const detailId = useId();
  const browserSignal = useSyncExternalStore(noSubscription, browserAsksNotToTrack, () => false);
  const [analyticsOn, setAnalyticsOn] = useState(initial ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    initial === null ? "We couldn’t load this setting. Reload to try again." : null,
  );

  async function change(next: boolean) {
    if (saving) return;
    setError(null);
    setAnalyticsOn(next);
    setSaving(true);
    const result = await apiRequest("patch", "/me/privacy", { body: { analyticsOn: next } });
    if (!isMounted()) return;
    setSaving(false);
    if (result.ok) {
      setAnalyticsOn(result.data.analyticsOn);
      applyAnalyticsChoice(result.data.analyticsOn, studentId, isInternal);
      // Every signed-in page reads the switch on the server: Back must not
      // bring back the old value.
      router.refresh();
      return;
    }
    setAnalyticsOn(!next);
    if (isUnauthorized(result)) router.replace(signInPath(ROUTES.home));
    else setError(failureMessage(result));
  }

  const shownOn = analyticsOn && !browserSignal;
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.settings} backLabel="Your account" />
        <main className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-6">
          <h1 className="font-heading text-h3 font-medium text-navy">Security and privacy</h1>

          {/* As the reminder toggles (222:2347): white, 1.5px off-white edge, 22px corners. */}
          <div className="flex items-center gap-3 rounded-card border-[1.5px] border-off-white bg-white px-5 py-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p id={titleId} className="text-body-m text-navy">
                Analytics
              </p>
              <p id={detailId} className="text-body-s break-words text-indigo-black/75">
                {browserSignal
                  ? "Off: your browser asks sites not to track you."
                  : "Taps and screen recordings that help us fix Cense. Typing is always hidden."}
              </p>
            </div>
            <Switch
              checked={shownOn}
              disabled={saving || browserSignal || initial === null}
              onCheckedChange={(next) => change(next)}
              aria-labelledby={titleId}
              aria-describedby={detailId}
            />
          </div>
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}

        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
