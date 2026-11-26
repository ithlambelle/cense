"use client";

import BellSlash from "@gravity-ui/icons/BellSlash";
import Clock from "@gravity-ui/icons/Clock";
import Envelope from "@gravity-ui/icons/Envelope";
import { useRouter } from "next/navigation";
import { useId, useState, type ComponentType, type ReactNode, type SVGProps } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Switch } from "@/components/ui/switch";
import { SENSITIVE, track } from "@/lib/analytics";
import { saveReminderSetting, type ReminderSettings } from "@/lib/api-client/reminder-settings";
import { ROUTES, signInPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Kind = "statementClosing" | "paymentDue" | "checkAutopay" | "applicationUpdates";

// The three emails, in the frame's order and words (Figma 222:2344), then
// Application updates, which the frame does not have: the check-ins while a
// student waits on an issuer ("Heard back yet?", "Has your letter come?"),
// in the same row style.
const KINDS: {
  key: Kind;
  setting: "statement_closing" | "payment_due" | "check_autopay" | "application_updates";
  title: string;
  detail: string;
}[] = [
  { key: "statementClosing", setting: "statement_closing", title: "Statement closes soon", detail: "With your pay-down target" },
  { key: "paymentDue", setting: "payment_due", title: "Payment due", detail: "Before it’s due" },
  { key: "checkAutopay", setting: "check_autopay", title: "Check autopay", detail: "Once, after your first statement" },
  { key: "applicationUpdates", setting: "application_updates", title: "Application updates", detail: "While you wait to hear from an issuer" },
];

// "Payment due" says which cards it skips: no due-date email goes out for a
// card whose autopay is on (claim_due_reminders, Ben, Nov 4), so the switch
// alone read as if those emails were coming (persona walk, Nov 25). `cards`
// are the student's approved cards.
export function paymentDueDetail(cards: { name: string; autopayOn: boolean }[]): string {
  const autopay = cards.filter((card) => card.autopayOn).map((card) => card.name);
  if (autopay.length === 0) return "Before it’s due";
  if (autopay.length === cards.length) return "Skipped while autopay is on";
  const names = autopay.length === 1 ? autopay[0] : `${autopay.slice(0, -1).join(", ")} and ${autopay.at(-1)}`;
  return `Before it’s due. Skipped for ${names}: autopay is on`;
}

type Props = {
  settings: ReminderSettings;
  email: string | null;
  // The approved cards, for the Payment due line (paymentDueDetail).
  cards?: { name: string; autopayOn: boolean }[];
  // Replaced in tests and the dev preview, so they never call the API.
  save?: typeof saveReminderSetting;
};

// Reminder settings (Figma 222:2344, opened from Your account, 222:2282, and
// from the footer of every reminder email). Each toggle saves as it is
// flipped: there is no Save button in the frame. They are the student's, so
// they cover every card. "Turn off all reminders" is what the unsubscribe link
// does; the off state is not drawn and is built in the frame's parts: one
// line and a button to turn them back on, which keeps each kind as it was.
export function ReminderSettingsView({ settings: initial, email, cards = [], save = saveReminderSetting }: Props) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  // Settings whose save is in flight; each is locked until its answer arrives.
  const [saving, setSaving] = useState<ReadonlySet<keyof ReminderSettings>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // The last change was saved: said under the toggles, so a student does not
  // reload to check (persona walk, Nov 25). Cleared when the next one starts.
  const [saved, setSaved] = useState(false);

  function setPending(key: keyof ReminderSettings, pending: boolean) {
    setSaving((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function change(key: keyof ReminderSettings, value: boolean, optimistic: boolean) {
    if (saving.has(key)) return;
    setError(null);
    setSaved(false);
    // A toggle moves at once and moves back if the save fails; the emails
    // button waits for the answer, as it changes the whole screen.
    if (optimistic) setSettings((current) => ({ ...current, [key]: value }));
    setPending(key, true);
    const result = await save({ [key]: value });
    setPending(key, false);
    if (result.kind === "ok") {
      // Only this setting: another one may still be saving.
      setSettings((current) => ({ ...current, [key]: result.settings[key] }));
      setSaved(true);
      const kind = KINDS.find((entry) => entry.key === key);
      track("reminder_settings_changed", { setting: kind ? kind.setting : "emails", on: value, source: "settings" });
      // Home and the plan read these on the server (the reminder star):
      // refresh so Back never restores them as they were.
      router.refresh();
      return;
    }
    if (optimistic) setSettings((current) => ({ ...current, [key]: !value }));
    if (result.kind === "signed-out") router.replace(signInPath(ROUTES.reminderSettings));
    else setError(result.message);
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.settings} backLabel="Your account" />
        {/* pt-2: the shared header is 8px taller than the frame's, so the
            heading still starts 96px from the top as drawn. */}
        <main className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-6">
          <h1 className="font-heading text-h3 font-medium text-navy">Reminder settings</h1>

          {settings.emailsOn ? (
            <>
              {/* Reminders (222:2347): white, 1.5px off-white edge, 22px corners, 20px sides. */}
              <ul aria-label="Reminder emails" className="flex flex-col rounded-card border-[1.5px] border-off-white bg-white px-5 py-1">
                {KINDS.map((kind, index) => (
                  <li key={kind.key} className={index > 0 ? "border-t-[1.5px] border-off-white" : undefined}>
                    <ToggleRow
                      title={kind.title}
                      detail={kind.key === "paymentDue" ? paymentDueDetail(cards) : kind.detail}
                      checked={settings[kind.key]}
                      disabled={saving.has(kind.key) || saving.has("emailsOn")}
                      onChange={(value) => change(kind.key, value, true)}
                    />
                  </li>
                ))}
              </ul>
              {/* Always here while the toggles are, so a screen reader hears it
                  when it appears; out of the layout while empty. */}
              <p role="status" className="-mt-2 text-body-s text-indigo-black/75 empty:hidden">
                {saved ? "Saved." : ""}
              </p>
              {email ? (
                <InfoRow icon={Envelope}>
                  To <span className={SENSITIVE}>{email}</span>
                </InfoRow>
              ) : null}
              <InfoRow icon={Clock}>Max one a day.</InfoRow>
            </>
          ) : (
            <InfoRow icon={BellSlash}>Reminders are off. We won’t email you about your cards.</InfoRow>
          )}

          <div className="flex-1" />
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          {/* Each its own key: reusing one element would fade the link into the
              filled button through low-contrast colors. */}
          {settings.emailsOn ? (
            // 222:2377: Inter SemiBold 16/24, Amethyst, underlined, centered.
            <Button
              key="turn-off"
              variant="link"
              className="text-body-m font-semibold"
              pending={saving.has("emailsOn")}
              onClick={() => change("emailsOn", false, false)}
            >
              Turn off all reminders
            </Button>
          ) : (
            <Button key="turn-on" pending={saving.has("emailsOn")} onClick={() => change("emailsOn", true, false)}>
              Turn reminders back on
            </Button>
          )}
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

// Toggle row (222:2348): title 16/24 navy and detail 14/20 at 75% on the left,
// the toggle on the right, 14px above and below, 12px between.
function ToggleRow({
  title,
  detail,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p id={`${id}-title`} className="text-body-m text-navy">
          {title}
        </p>
        <p id={`${id}-detail`} className="text-body-s break-words text-indigo-black/75">
          {detail}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next)}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-detail`}
      />
    </div>
  );
}

// Info row (222:2368): a 20px Gravity icon and 14/20 text, 12px apart. The
// icon stays level with the first line when the text wraps (a long address
// on a small phone).
function InfoRow({ icon: Icon, children, className }: { icon: ComponentType<SVGProps<SVGSVGElement>>; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-3 text-body-s text-indigo-black", className)}>
      <Icon aria-hidden="true" width={20} height={20} className="shrink-0 text-navy" />
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </p>
  );
}
