import type { ComponentType, ReactNode, SVGProps } from "react";

import { cn } from "@/lib/utils";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// The off-white notice with an icon, a short title and an optional line
// (denial frames). Some frames draw the title alone.
export function Notice({ icon: IconComponent, title, children }: { icon: Icon; title: string; children?: ReactNode }) {
  return (
    <section className={cn("flex gap-3 rounded-input bg-off-white p-4", !children && "items-center")}>
      <IconComponent aria-hidden="true" width={22} height={22} className={cn("shrink-0 text-violet", children && "mt-0.5")} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-indigo-black">
        <h2 className="font-heading text-h6 font-medium">{title}</h2>
        {children ? <div className="text-body-s">{children}</div> : null}
      </div>
    </section>
  );
}

// The round mark above an outcome title. A good outcome is the Light Green
// circle with a navy check (frames 144:2196, 144:2492); a wait is the off-white
// circle with a violet hourglass (144:2541).
export function OutcomeMark({ icon: IconComponent, tone = "neutral" }: { icon: Icon; tone?: "success" | "neutral" }) {
  const success = tone === "success";
  return (
    <div className={cn("flex size-16 items-center justify-center rounded-pill", success ? "bg-green" : "bg-off-white")}>
      <IconComponent aria-hidden="true" width={30} height={30} className={success ? "text-navy" : "text-violet"} />
    </div>
  );
}

// An outlined card with a numbered list, for steps that are a real sequence.
export function NumberedSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li key={step} className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-off-white font-number text-number-s text-violet"
          >
            {index + 1}
          </span>
          <span className="text-body-s text-indigo-black">{step}</span>
        </li>
      ))}
    </ol>
  );
}
