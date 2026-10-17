import type { ComponentType, ReactNode, SVGProps } from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// The off-white notice with an icon, a short title and a line (denial frames).
export function Notice({ icon: IconComponent, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-3 rounded-input bg-off-white p-4">
      <IconComponent aria-hidden="true" width={22} height={22} className="mt-0.5 shrink-0 text-violet" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-indigo-black">
        <h2 className="font-heading text-h6 font-medium">{title}</h2>
        <div className="text-body-s">{children}</div>
      </div>
    </section>
  );
}

// The round mark above an outcome title (check or hourglass).
export function OutcomeMark({ icon: IconComponent }: { icon: Icon }) {
  return (
    <div className="flex size-16 items-center justify-center rounded-pill bg-off-white">
      <IconComponent aria-hidden="true" width={30} height={30} className="text-violet" />
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
