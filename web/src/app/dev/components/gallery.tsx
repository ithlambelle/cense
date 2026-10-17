"use client";

import { useState, type ReactNode } from "react";

import { BackLink } from "@/components/ui/back-link";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { GlowCard } from "@/components/ui/glow-card";
import { Disclaimer, NoteLine } from "@/components/ui/note";
import { ProgressBar } from "@/components/ui/progress-bar";
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

export function Gallery() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <ScreenShell
        nav={<BottomNav />}
        footer={
          <Button onClick={() => window.scrollTo({ top: 0 })}>Back to top</Button>
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

        <Section title="Progress (quiz)">
          <p className="text-body-s text-indigo-black">Question 4 of 6</p>
          <ProgressBar current={4} total={6} />
          <p className="text-body-s text-indigo-black/70">The full quiz with its answer buttons is at /dev/quiz.</p>
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
