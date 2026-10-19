import { BottomNav } from "@/components/ui/bottom-nav";
import { Mascot } from "@/components/mascot/mascot";

// "Hold tight!" from Figma 397:933, shown while the result is being worked out.
// No minimum display time is added (NN/g response-time limits: anything under
// a second keeps the student's flow).
export function FindingCards() {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <main className="stagger flex flex-1 flex-col items-center justify-center gap-[53px] px-6 pb-[165px]">
          <Mascot pose="swim" size={157} className="size-[157px]" priority />
          {/* The live region is the text only, so the page keeps its main landmark. */}
          <div role="status" className="flex w-[226px] flex-col items-center gap-2 text-center">
            <h1 className="font-heading text-h3 font-medium text-navy">Hold tight!</h1>
            <p className="text-body-s text-indigo-black/70">Finding the right cards for you</p>
          </div>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
