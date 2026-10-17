import Image from "next/image";
import type { ReactNode } from "react";

import { BottomNav } from "@/components/ui/bottom-nav";
import { cn } from "@/lib/utils";

type MessageScreenProps = {
  title: string;
  body: string;
  children: ReactNode;
  // True on a signed-in screen, which keeps the bottom bar like every other.
  bottomNav?: boolean;
};

// A full-screen message with the mascot, a title, one line and actions: the
// not-found and error pages (S30). No frame: built from the welcome and
// denial frames' parts and proposed to design.
export function MessageScreen({ title, body, children, bottomNav = false }: MessageScreenProps) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <main
          className={cn(
            "flex flex-1 flex-col px-6 pt-16",
            // The bottom bar keeps clear of the home indicator itself.
            bottomNav ? "pb-6" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          )}
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <Image src="/mascot/penny.png" alt="" width={140} height={140} />
            <h1 className="font-heading text-h2 font-medium text-navy">{title}</h1>
            <p className="text-body-m text-indigo-black">{body}</p>
          </div>
          <div className="flex flex-col gap-2.5 pt-10">{children}</div>
        </main>
        {bottomNav ? (
          <div className="sticky bottom-0">
            <BottomNav />
          </div>
        ) : null}
      </div>
    </div>
  );
}
