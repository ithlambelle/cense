// "Hold tight!" from Figma 397:933, shown while the result is being worked out.
// No minimum display time is added (NN/g response-time limits: anything under
// a second keeps the student's flow). The mascot animation is replaced by a
// still for anyone who asks the system for reduced motion.
export function FindingCards() {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main
        role="status"
        aria-live="polite"
        className="flex w-full max-w-phone flex-col items-center justify-center gap-[53px] px-6 pb-[165px]"
      >
        <picture>
          <source media="(prefers-reduced-motion: reduce)" srcSet="/mascot/penny-loading-still.png" />
          {/* A plain img: next/image cannot sit inside picture, and the files are already sized for 2x. */}
          <img src="/mascot/penny-loading.webp" alt="" width={157} height={157} className="size-[157px]" />
        </picture>
        <div className="flex w-[226px] flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-h3 font-medium text-navy">Hold tight!</h1>
          <p className="text-body-s text-indigo-black/70">Finding the right cards for you</p>
        </div>
      </main>
    </div>
  );
}
