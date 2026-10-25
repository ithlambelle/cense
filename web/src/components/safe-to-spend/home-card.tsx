import Wallet from "@gravity-ui/icons/Wallet";
import Link from "next/link";

import { RefreshWhenStale } from "@/components/safe-to-spend/refresh-when-stale";
import { PreviewLabel } from "@/components/safe-to-spend/parts";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { SENSITIVE } from "@/lib/analytics";
import type { SafeToSpend } from "@/lib/api/safe-to-spend";
import { moneyAmount } from "@/lib/money";
import { ROUTES, safeToSpendSetupPath } from "@/lib/routes";
import { SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";
import { cn } from "@/lib/utils";

const NAVY_LINK =
  "min-h-11 content-center text-body-s font-semibold text-white underline underline-offset-2 outline-none hover:text-light-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-off-white";

// Safe to spend on Home (US-12). Linked and answered: the navy card from
// "Home with safe to spend" (Figma 222:2133). Linked but not answered: a
// prompt to finish. Not linked: an invitation to try the sandbox preview.
// Nothing at all when safe to spend is off (no Plaid settings).
export function SafeToSpendHome({ safeToSpend }: { safeToSpend: SafeToSpend | null }) {
  if (safeToSpend === null) {
    return (
      <QuietCard
        title={SAFE_TO_SPEND_COPY.inviteTitle}
        body={SAFE_TO_SPEND_COPY.inviteBody}
        action={{ href: ROUTES.safeToSpendConnect, label: "Try it" }}
      />
    );
  }
  if (!safeToSpend.answered) {
    return (
      <QuietCard
        title="Finish safe to spend"
        body="Say who covers your bills, then see your number."
        action={{ href: safeToSpendSetupPath(), label: "Continue" }}
      />
    );
  }
  return (
    <section aria-label="Safe to spend" className="flex flex-col rounded-[28px] bg-navy px-[23px] pt-[27px] pb-4 text-white shadow-glow-form">
      <div className="flex items-start justify-between gap-3">
        <p className="text-body-m leading-[18px] font-semibold">Safe to spend today:</p>
        <PreviewLabel onNavy className="-mt-0.5" />
      </div>
      {safeToSpend.status === "reconnect_needed" ? (
        <>
          <p className="pt-3 text-body-s">{SAFE_TO_SPEND_COPY.reconnect}</p>
          <Link href={ROUTES.safeToSpend} className={cn(NAVY_LINK, "self-start")}>
            Reconnect your bank
          </Link>
        </>
      ) : (
        <>
          {/* Masked in session replay: it is the student's own money. */}
          <p className={cn(SENSITIVE, "pt-2 font-number text-[36px] leading-[44px] font-medium text-light-blue")}>
            {moneyAmount(safeToSpend.dailyCents)}
            <span className="text-[24px]"> a day</span>
          </p>
          <div className="flex items-center justify-between gap-3 pt-2 text-body-s">
            <p>For the next {safeToSpend.days} days</p>
            <Link href={ROUTES.safeToSpend} className={NAVY_LINK}>
              How we got this
            </Link>
          </div>
          <RefreshWhenStale refreshedAt={safeToSpend.refreshedAt} />
        </>
      )}
    </section>
  );
}

// The quiet card Home uses for a next step (an icon, a short title and line,
// one action), with the Preview label.
function QuietCard({ title, body, action }: { title: string; body: string; action: { href: string; label: string } }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card border border-hairline bg-white p-5">
      <div className="flex items-center gap-3">
        <Wallet aria-hidden="true" width={22} height={22} className="shrink-0 text-violet" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-indigo-black">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-heading text-h6 font-medium">{title}</h2>
            <PreviewLabel />
          </div>
          <p className="text-body-s">{body}</p>
        </div>
      </div>
      <Link href={action.href} className={buttonVariants()}>
        {action.label}
        <ButtonChevron />
      </Link>
    </section>
  );
}
