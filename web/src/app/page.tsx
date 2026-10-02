import { ArrowRight, BadgeCheck, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8f3] px-6 py-8 text-[#17211b] sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col rounded-[2rem] border border-[#17211b]/10 bg-white p-6 shadow-sm sm:p-10">
        <header className="flex items-center justify-between">
          <span className="text-lg font-black tracking-[0.18em]">CENSE</span>
          <span className="rounded-full bg-[#dceadf] px-3 py-1 text-xs font-semibold text-[#2e6a4b]">
            Sprint 0 foundation
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2e6a4b]/20 bg-[#dceadf]/60 px-4 py-2 text-sm font-semibold text-[#2e6a4b]">
              <ShieldCheck className="size-4" />
              Guidance before the application
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">
              Your first credit card should feel clear, not risky.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4f5d55]">
              CENSE turns a student&apos;s goals and financial profile into a
              small set of understandable options, with honest reasoning and a
              path forward if the answer is not yet.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button className="h-12 rounded-xl bg-[#2e6a4b] px-6 hover:bg-[#24583e]">
                Start the guided match <ArrowRight className="size-4" />
              </Button>
              <Button variant="outline" className="h-12 rounded-xl px-6">
                See how recommendations work
              </Button>
            </div>
          </div>

          <aside className="rounded-[1.5rem] bg-[#17211b] p-7 text-white shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#a8c9b2]">
              Built around trust
            </p>
            <div className="mt-6 space-y-5">
              {[
                "Explain every recommendation in plain language",
                "Separate fit guidance from guaranteed approval",
                "Protect student data and avoid paid ranking bias",
              ].map((item) => (
                <div key={item} className="flex gap-3">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-[#f2b84b]" />
                  <p className="leading-6 text-white/85">{item}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <footer className="border-t border-[#17211b]/10 pt-5 text-sm text-[#657169]">
          Web, iOS, API contracts, and shared design tokens are initialized.
        </footer>
      </div>
    </main>
  );
}
