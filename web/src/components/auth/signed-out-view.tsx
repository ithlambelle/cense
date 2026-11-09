import Image from "next/image";
import Link from "next/link";

import { GoogleButton } from "@/components/auth/google-button";
import { buttonVariants } from "@/components/ui/button";
import { googleSignInPath, ROUTES } from "@/lib/routes";

// Signed out (Flow F, F8, Figma 477:2942): Penny, "Welcome back", then two
// outlined buttons at the bottom. Google always asks which account
// (prompt=select_account), so Switch account works. No back arrow: the frame
// draws none, and the screens behind it need an account.
// Google's button keeps Google's own branding (the G, grey outline), as on the
// sign-in screen; the frame draws it violet without the G.
export function SignedOutView() {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main className="flex w-full max-w-phone flex-col gap-4 px-6 pt-28 pb-6">
        {/* Avatar, Penny, Large (371:3348): light blue tint behind Penny. */}
        <Image
          src="/mascot/astro-pig/avatar.png"
          alt=""
          width={64}
          height={64}
          priority
          className="size-16 shrink-0 rounded-pill bg-light-blue/50"
        />
        <h1 className="font-heading text-h1 font-medium text-navy">Welcome back</h1>
        <p className="text-body-m text-indigo-black">Sign in to see your cards and reminders.</p>
        <div className="flex-1" />
        <GoogleButton href={googleSignInPath(ROUTES.home)} />
        <Link href={ROUTES.signIn} className={buttonVariants({ variant: "outline", className: "text-button text-violet" })}>
          Continue with email
        </Link>
      </main>
    </div>
  );
}
