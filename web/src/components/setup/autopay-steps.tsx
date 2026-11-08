// Created with Claude Code (2026-11-08). I2, "Turn on autopay at <issuer>"
// (Figma Design Edits 477:1616, US-10): the issuer's own steps and two link
// outs, its app and its site, each in a new tab. Cense never sees the login.

import Link from "next/link";

import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import type { Issuer } from "@/lib/cards/issuers";
import { autopayConfirmPath, cardSetupPath } from "@/lib/routes";

import { IssuerLinks } from "./issuer-links";
import { HandoffStrip, InfoCallout, NumberRow, SetupHeading, SetupScreen, Spacer } from "./setup-parts";

// For a card Cense has no issuer steps for: the same three steps in general words.
const GENERAL_STEPS = [
  { title: "Open your card's app or site", detail: "Sign in where you pay this card." },
  { title: "Find autopay", detail: "Check payment settings, or try “make a payment” from the payment menu." },
  { title: "Pick the statement balance", detail: "This helps avoid interest. Just make sure you keep enough in your checking." },
];

export function AutopaySteps({ applicationId, brand, issuer }: { applicationId: string; brand: string | null; issuer: Issuer | null }) {
  const name = issuer?.name ?? brand;
  const steps = issuer?.steps ?? GENERAL_STEPS;
  return (
    <SetupScreen back={{ href: cardSetupPath(applicationId), label: "Card setup" }}>
      <HandoffStrip issuer={name ?? "Your card"} stage="issuer" />
      <SetupHeading>{name ? `Turn on autopay at ${name}` : "Turn on autopay"}</SetupHeading>
      <p className="text-body-m text-indigo-black">
        {name ? `You finish this in ${name}'s app or site.` : "You finish this in your card's app or site."} Cense cannot do it for you.
      </p>
      <ol className="flex flex-col gap-4">
        {steps.map((step, index) => (
          <NumberRow key={step.title} number={index + 1} title={step.title} subtitle={step.detail} />
        ))}
      </ol>
      <Spacer />
      <InfoCallout title={name ? `Cense never sees your ${name} login` : "Cense never sees your card login"}>
        {name ? `You sign in on ${name}'s own app or site.` : "You sign in on your card's own app or site."}
      </InfoCallout>
      {issuer ? (
        <IssuerLinks issuer={issuer} confirmHref={autopayConfirmPath(applicationId)} />
      ) : (
        // No issuer steps to link to: the student goes on when they are done.
        <Link href={autopayConfirmPath(applicationId)} className={buttonVariants()}>
          Next
          <ButtonChevron />
        </Link>
      )}
    </SetupScreen>
  );
}
