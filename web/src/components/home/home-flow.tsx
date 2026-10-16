"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AddCardForm } from "@/components/home/add-card-form";
import { FailedScreen, LoadingScreen } from "@/components/shell/status-screens";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button, buttonVariants } from "@/components/ui/button";
import { GlowCard } from "@/components/ui/glow-card";
import { ScreenShell } from "@/components/ui/screen-shell";
import { apiRequest, failureMessage, isUnauthorized, type ApiData } from "@/lib/api-client/client";
import { STATUS_LABELS, statusDetail } from "@/lib/copy/applications";
import { ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";

type Applications = ApiData<"/applications", "get">["applications"];

async function loadApplications(): Promise<LoadOutcome<Applications>> {
  const result = await apiRequest("get", "/applications");
  if (result.ok) return { status: "ready", data: result.data.applications };
  if (isUnauthorized(result)) return "signed-out";
  return { status: "failed", message: failureMessage(result) };
}

const HOME_SIGN_IN = signInPath(ROUTES.home);

export function HomeFlow() {
  const router = useRouter();
  const { loaded, retry } = useLoaded(loadApplications, HOME_SIGN_IN);
  const [adding, setAdding] = useState(false);
  const nav = <BottomNav />;

  if (loaded.status === "loading") return <LoadingScreen label="Loading your cards" nav={nav} />;
  if (loaded.status === "failed") {
    return <FailedScreen title="We couldn’t load your cards" message={loaded.message} onRetry={retry} nav={nav} />;
  }

  const applications = loaded.data;
  const accountLink = (
    <Link href={ROUTES.settings} className={buttonVariants({ variant: "link", className: "self-end" })}>
      Account
    </Link>
  );

  if (adding) {
    return (
      <ScreenShell nav={nav}>
        <h1 className="font-heading text-title font-bold">Add a card you already have</h1>
        <GlowCard purpose="form" className="mt-6">
          <AddCardForm
            // Reload on close too: a submit that got no answer may have saved.
            onCancel={() => {
              setAdding(false);
              retry();
            }}
            onSignedOut={() => router.replace(HOME_SIGN_IN)}
            onAdded={() => {
              setAdding(false);
              retry();
            }}
          />
        </GlowCard>
      </ScreenShell>
    );
  }

  if (applications.length === 0) {
    return (
      <ScreenShell nav={nav}>
        {accountLink}
        <h1 className="font-heading text-title font-bold">Welcome to Cense</h1>
        <p className="mt-2 text-body text-muted-foreground">
          No cards here yet. Pick where to start.
        </p>
        <div className="mt-8 flex flex-col gap-4">
          <Link href={ROUTES.quiz} className={buttonVariants()}>
            Take the quiz
          </Link>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add a card I already have
          </Button>
          <Link href={ROUTES.cards} className={buttonVariants({ variant: "secondary" })}>
            Browse cards
          </Link>
        </div>
        <Link href={ROUTES.results} className={buttonVariants({ variant: "link", className: "mt-4 self-center" })}>
          See my card match
        </Link>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell nav={nav}>
      {accountLink}
      <h1 className="font-heading text-title font-bold">Your cards</h1>
      <ul className="mt-6 flex flex-col gap-4">
        {applications.map((application) => {
          const detail = statusDetail(application);
          return (
            <li key={application.id} className="flex flex-col gap-1 rounded-card border-[1.5px] border-primary p-5">
              <h2 className="font-heading text-section font-semibold">{application.cardName}</h2>
              <p className="text-body">{STATUS_LABELS[application.status]}</p>
              {detail ? <p className="text-label text-muted-foreground">{detail}</p> : null}
            </li>
          );
        })}
      </ul>
      <Button variant="link" className="mt-4 self-center" onClick={() => setAdding(true)}>
        Add a card I already have
      </Button>
      <Link href={ROUTES.results} className={buttonVariants({ variant: "link", className: "self-center" })}>
        See my card match
      </Link>
    </ScreenShell>
  );
}
