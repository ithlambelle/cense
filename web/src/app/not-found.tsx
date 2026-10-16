import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { ScreenShell } from "@/components/ui/screen-shell";
import { ROUTES } from "@/lib/routes";

export default function NotFound() {
  return (
    <ScreenShell footer={<Link href={ROUTES.cards} className={buttonVariants()}>Browse cards</Link>}>
      <h1 className="mt-15 font-heading text-title font-bold">We can’t find that page</h1>
      <p className="mt-2 text-body text-muted-foreground">The link may be old, or the page may have moved.</p>
    </ScreenShell>
  );
}
