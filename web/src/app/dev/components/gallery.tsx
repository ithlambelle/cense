"use client";

import Check from "@gravity-ui/icons/Check";
import { useState, type ReactNode } from "react";

import { Notice } from "@/components/denied/parts";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { ErrorMessage } from "@/components/ui/error-message";
import { FactChip } from "@/components/ui/fact-chip";
import { NoteLine } from "@/components/ui/note";
import { PasswordField } from "@/components/ui/password-field";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline py-8">
      <h2 className="font-heading text-h6 font-medium text-indigo-black">{title}</h2>
      {children}
    </section>
  );
}

// Every shared component in its states, for design review (development only).
export function Gallery() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <main className="flex flex-col px-6 pt-8 pb-6">
          <h1 className="font-heading text-h2 font-medium text-navy">Components</h1>
          <p className="mt-2 text-body-s text-indigo-black">Design system v2 (typography frame 219:3094), each in its states.</p>

          <Section title="Type scale">
            {/* Written out in full: Tailwind only generates classes it can see. */}
            {[
              ["H1", "text-h1"],
              ["H2", "text-h2"],
              ["H3", "text-h3"],
              ["H4", "text-h4"],
              ["H5", "text-h5"],
              ["H6", "text-h6"],
            ].map(([label, size]) => (
              <p key={label} className={`font-heading font-medium text-navy ${size}`}>
                Heading {label}
              </p>
            ))}
            <p className="text-body-l text-indigo-black">Body L, Inter Regular 18/28</p>
            <p className="text-body-m text-indigo-black">Body M, Inter Regular 16/24</p>
            <p className="text-body-s text-indigo-black">Body S, Inter Regular 14/20</p>
            <p className="font-number text-number-xl font-semibold text-indigo-black">$2,184</p>
            <p className="font-number text-number-m font-medium text-indigo-black">$24.89</p>
          </Section>

          <Section title="Buttons">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="navyOutline">Navy outline</Button>
            <Button disabled>Disabled</Button>
            <Button
              pending={pending}
              onClick={() => {
                setPending(true);
                setTimeout(() => setPending(false), 1500);
              }}
            >
              Press to see pending
            </Button>
          </Section>

          <Section title="Fields">
            <TextField label="Email" type="email" placeholder="Your email" autoComplete="email" />
            <TextField label="Email" defaultValue="alex@" error="That email doesn’t look quite right." />
            <PasswordField label="Password" placeholder="Your password" />
            <CodeInput value={code} onChange={setCode} />
          </Section>

          <Section title="Progress, facts and status">
            <p className="text-body-s text-indigo-black">Question 4 of 6</p>
            <ProgressBar current={4} total={6} />
            <dl className="flex flex-wrap gap-3">
              <FactChip label="Annual fee" value="$0" />
              <FactChip label="Deposit" value="From $49" />
            </dl>
            <div className="flex gap-2">
              <StatusPill>APPLIED</StatusPill>
              <StatusPill>REJECTED</StatusPill>
            </div>
          </Section>

          <Section title="Notes and messages">
            <NoteLine>This check won’t affect your credit score.</NoteLine>
            <Notice icon={Check} title="A second look is not a new application">
              Ask whether another hard credit check is required before you agree to anything.
            </Notice>
            <ErrorMessage>We couldn’t reach Cense. Check your connection and try again.</ErrorMessage>
          </Section>

          <Section title="Sheet">
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open a sheet
            </Button>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Check first, then decide" description="A sample sheet.">
              <Button onClick={() => setSheetOpen(false)}>Close</Button>
            </Sheet>
          </Section>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
