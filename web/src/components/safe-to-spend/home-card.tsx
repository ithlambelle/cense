import Wallet from "@gravity-ui/icons/Wallet";
import Link from "next/link";

import { RefreshWhenStale } from "@/components/safe-to-spend/refresh-when-stale";
import { PreviewLabel } from "@/components/safe-to-spend/parts";
import { UpdatedTime } from "@/components/safe-to-spend/updated-time";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { MoneyHero } from "@/components/your-money/parts";
import type { SafeToSpend } from "@/lib/api/safe-to-spend";
import { moneyAmount } from "@/lib/money";
import { ROUTES } from "@/lib/routes";
import { SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";

// The link under a broken bank's notice: 44px tall to tap.
const NAVY_LINK =
  "inline-flex min-h-11 items-center font-semibold text-white underline underline-offset-2 hover:text-light-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-off-white";

// Safe to spend on Home (US-12). Linked and answered: the designers' navy
// hero as D1 draws it (Figma 709:1470), the same hero as Your money. Linked
// but not answered: a prompt to finish. Not linked: an invitation to try the
// sandbox preview.
// Nothing at all when safe to spend is off (no Plaid settings).
// `preview` false drops the Preview label from the invite and setup cards:
// Home's approval celebration never says "Preview" (Ben, 2026-11-08).
export function SafeToSpendHome({ safeToSpend, preview = true }: { safeToSpend: SafeToSpend | null; preview?: boolean }) {
  if (safeToSpend === null) {
    return (
      <QuietCard
        title={SAFE_TO_SPEND_COPY.inviteTitle}
        body={SAFE_TO_SPEND_COPY.inviteBody}
        action={{ href: ROUTES.safeToSpendConnect, label: "Try it" }}
        preview={preview}
      />
    );
  }
  if (!safeToSpend.answered) {
    return (
      <QuietCard
        title="Finish safe to spend"
        body="Penny reads your bank, then you see your number."
        action={{ href: ROUTES.safeToSpendReading, label: "Continue" }}
        preview={preview}
      />
    );
  }
  // A broken link shows what to do, never the last number as if current, the
  // way Your money's hero says it.
  if (safeToSpend.status !== "active") {
    const reconnect = safeToSpend.status === "reconnect_needed";
    return (
      <MoneyHero
        ariaLabel="Safe to spend"
        label="Safe to spend today:"
        // Its own block, so its lines are 28px apart, not the number's 44.
        amount={<span className="block pt-2 text-[20px] leading-7">{reconnect ? SAFE_TO_SPEND_COPY.reconnect : SAFE_TO_SPEND_COPY.relink}</span>}
        left={
          <Link href={ROUTES.accounts} className={NAVY_LINK}>
            {reconnect ? "Reconnect your bank" : "Connect again"}
          </Link>
        }
      />
    );
  }
  // The designers' hero, as D1 draws it (709:1470): the number in Unbounded
  // Bold 44, "For the next 30 days" and when the bank was last read. The whole
  // card opens Your money (D1 decided: tapping the card opens D2, no separate
  // button). No Preview label on the number (Ben, 2026-11-14); the invite and
  // setup cards keep it.
  return (
    <MoneyHero
      ariaLabel="Safe to spend"
      label="Safe to spend today:"
      amount={moneyAmount(safeToSpend.dailyCents)}
      unit=" a day"
      left={`For the next ${safeToSpend.days} days`}
      right={<UpdatedTime refreshedAt={safeToSpend.refreshedAt} />}
      link={{ href: ROUTES.safeToSpend, label: "Your money" }}
    >
      <RefreshWhenStale refreshedAt={safeToSpend.refreshedAt} />
    </MoneyHero>
  );
}

// The quiet card Home uses for a next step (an icon, a short title and line,
// one action), with the Preview label.
function QuietCard({
  title,
  body,
  action,
  preview,
}: {
  title: string;
  body: string;
  action: { href: string; label: string };
  preview: boolean;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card border border-hairline bg-white p-5">
      <div className="flex items-center gap-3">
        <Wallet aria-hidden="true" width={22} height={22} className="shrink-0 text-violet" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-indigo-black">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-heading text-h6 font-medium">{title}</h2>
            {preview ? <PreviewLabel /> : null}
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
