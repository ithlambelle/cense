import { Button } from "@/components/ui/button";
import { ScreenShell } from "@/components/ui/screen-shell";

export const UNDER_18_TITLE = "Cense is for 18 and over.";
export const UNDER_18_BODY = "Issuers require it too.";

// Shown when the student chooses "Under 18". Nothing has been saved.
export function Under18Screen({ onBack }: { onBack: () => void }) {
  return (
    <ScreenShell footer={<Button variant="secondary" onClick={onBack}>Back</Button>}>
      <h1 className="mt-15 font-heading text-title font-bold">{UNDER_18_TITLE}</h1>
      <p className="mt-2 text-body text-muted-foreground">{UNDER_18_BODY}</p>
    </ScreenShell>
  );
}
