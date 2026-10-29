import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MessageScreen } from "@/components/shell/message-screen";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { currentStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Account deleted | CENSE" };

// Where Delete my account lands, signed out. Someone signed in is sent Home:
// this screen would not be true for them.
export default async function AccountDeletedPage() {
  if (await currentStudent()) redirect(ROUTES.home);
  return (
    <MessageScreen title="Your account is deleted" body="Everything you saved in Cense is gone. You can sign up again any time.">
      <Link href={ROUTES.welcome} className={buttonVariants()}>
        Back to Cense
        <ButtonChevron />
      </Link>
    </MessageScreen>
  );
}
