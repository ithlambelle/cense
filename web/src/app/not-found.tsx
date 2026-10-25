import type { Metadata } from "next";
import Link from "next/link";

import { MessageScreen } from "@/components/shell/message-screen";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Page not found | CENSE" };

export default function NotFound() {
  return (
    <MessageScreen title="We can’t find that page" body="The link may be old, or the page may have moved.">
      <Link href={ROUTES.start} className={buttonVariants()}>
        Go to Cense
        <ButtonChevron />
      </Link>
      <Link href={ROUTES.cards} className={buttonVariants({ variant: "secondary" })}>
        Browse cards
      </Link>
    </MessageScreen>
  );
}
