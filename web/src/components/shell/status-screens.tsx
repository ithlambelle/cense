import Link from "next/link";

import { MessageScreen } from "@/components/shell/message-screen";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

// While a client screen reads its data (the quiz draft).
export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main className="flex w-full max-w-phone flex-col items-center justify-center gap-3 px-6">
        <span
          aria-hidden="true"
          className="size-6 rounded-full border-2 border-violet border-r-transparent motion-safe:animate-spin"
        />
        <p role="status" className="text-body-m text-indigo-black">
          {label}
        </p>
      </main>
    </div>
  );
}

type FailedScreenProps = {
  title: string;
  message: string;
  onRetry: () => void;
};

export function FailedScreen({ title, message, onRetry }: FailedScreenProps) {
  return (
    <MessageScreen title={title} body={message}>
      <Button onClick={onRetry}>Try again</Button>
      <Link href={ROUTES.home} className={buttonVariants({ variant: "secondary" })}>
        Go to Home
      </Link>
    </MessageScreen>
  );
}
