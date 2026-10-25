import Image from "next/image";

import { cn } from "@/lib/utils";

// "Continue with Google", built to Google's sign-in branding guidelines:
// light theme (#FFFFFF fill, 1px #747775 stroke, #1F1F1F text), the official
// full-color G from Google's asset bundle unaltered on white, Google Sans
// Medium, pill shape, and at least as prominent as any other way to sign in.
// https://developers.google.com/identity/branding-guidelines
// A plain link: the browser has to leave the page to reach Google.
export function GoogleButton({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "flex h-14 w-full items-center justify-center gap-2.5 rounded-button border border-[#747775] bg-white px-3 font-google text-body-m font-medium text-[#1F1F1F] outline-none hover:bg-[#F8F8F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <Image src="/brand/google-g.png" alt="" width={20} height={20} />
      Continue with Google
    </a>
  );
}
