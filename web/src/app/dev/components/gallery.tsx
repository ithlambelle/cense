"use client";

import { useId, useState, type ReactNode } from "react";

import { BackLink } from "@/components/ui/back-link";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { GlowCard } from "@/components/ui/glow-card";
import { Disclaimer, NoteLine } from "@/components/ui/note";
import { OptionGroup } from "@/components/ui/option-group";
import { ProgressSegments, progressLabel } from "@/components/ui/progress-segments";
import { ScreenShell } from "@/components/ui/screen-shell";
import { TextField } from "@/components/ui/text-field";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-track py-8">
      <h2 className="font-heading text-section font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

const TWO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const SIX_OPTIONS = [
  { value: "a", label: "A short choice" },
  { value: "b", label: "A longer choice that wraps onto a second line at this width" },
  { value: "c", label: "Another choice" },
];

export function Gallery() {
  const questionId = useId();
  const compactId = useId();
  const [two, setTwo] = useState<string | null>(null);
  const [many, setMany] = useState<string | null>("a");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <ScreenShell
        nav={<BottomNav />}
        footer={
          <Button disabled={two === null} onClick={() => setTwo(null)}>
            Continue
          </Button>
        }
      >
        <h1 className="font-heading text-title font-bold">Components</h1>
        <p className="mt-2 text-label text-muted-foreground">
          Every primitive in every state, for design review. The button below stays in view while this page scrolls.
        </p>

        <Section title="Type">
          <p className="font-heading text-title font-bold">Screen title, 28 / 36</p>
          <p className="font-heading text-card-name font-semibold">Card name, 20 / 28</p>
          <p className="font-heading text-section font-semibold">Section heading, 16 / 22</p>
          <p className="text-button">Button label, 18 / 28</p>
          <p className="text-body">Option and input text, 16 / 24</p>
          <p className="text-label text-muted-foreground">Label and helper, 14 / 20</p>
          <p className="text-legal text-muted-foreground">Legal line, 13 / 20</p>
        </Section>

        <Section title="Buttons">
          <Button>Continue</Button>
          <Button disabled>Continue</Button>
          <Button pending={pending} onClick={() => setPending(true)}>
            {pending ? "Saving" : "Press to see pending"}
          </Button>
          <Button variant="secondary" onClick={() => setPending(false)}>
            Retake quiz
          </Button>
          <Button variant="secondary" disabled>
            Retake quiz
          </Button>
          <Button variant="link">Send a new code</Button>
          <Button size="sm" className="self-start">
            Start
          </Button>
        </Section>

        <Section title="Back link">
          <BackLink onClick={() => undefined} />
        </Section>

        <Section title="Progress">
          <div className="flex items-center justify-between">
            <BackLink onClick={() => undefined} />
            <p className="text-label text-muted-foreground">{progressLabel(4, 6)}</p>
          </div>
          <ProgressSegments current={4} total={6} />
        </Section>

        <Section title="Options, two choices">
          <p id={questionId} className="font-heading text-title font-bold">
            Could you put down a refundable deposit of up to $200?
          </p>
          <OptionGroup labelledBy={questionId} options={TWO_OPTIONS} value={two} onChange={setTwo} />
        </Section>

        <Section title="Options, more choices">
          <p id={compactId} className="font-heading text-title font-bold">
            A question with more choices
          </p>
          <OptionGroup labelledBy={compactId} options={SIX_OPTIONS} value={many} onChange={setMany} density="compact" />
        </Section>

        <Section title="Form card and fields">
          <GlowCard purpose="form">
            <div className="flex flex-col gap-3">
              <TextField label="Email" type="email" placeholder="Your email" autoComplete="email" />
              <TextField label="Email" type="email" defaultValue="alex@email.com" hint="We only use this to sign you in." />
              <TextField label="Email" type="email" defaultValue="alex@" error="That email doesn’t look quite right." />
              <CodeInput value={code} onChange={setCode} />
              <CodeInput value="482916" onChange={() => undefined} error="That code didn’t work. Check it or send a new one." />
            </div>
            <Button>Verify</Button>
          </GlowCard>
        </Section>

        <Section title="Result card">
          <GlowCard purpose="result">
            <p className="font-heading text-card-name font-semibold">[CARD NAME]</p>
            <NoteLine>A note line sits under the card name.</NoteLine>
            <Button>Check if you’re preapproved</Button>
          </GlowCard>
          <Disclaimer>A line of guidance sits under the result.</Disclaimer>
        </Section>
      </ScreenShell>
  );
}
