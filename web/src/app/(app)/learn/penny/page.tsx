import type { Metadata } from "next";

import { PennyChat } from "@/components/learn/penny-chat";
import { findAnswer } from "@/lib/penny/answers";
import { pennyBackLink } from "@/lib/penny/navigation";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Ask Penny | CENSE" };

// Ask Penny. ?answer= opens with that checked answer (a tapped starter or
// topic question), so a reload shows it again; ?from= is where Back goes.
export default async function PennyPage({ searchParams }: PageProps<"/learn/penny">) {
  await requireStudent(ROUTES.penny);
  const { answer, from } = await searchParams;
  const initialAnswerId = typeof answer === "string" && findAnswer(answer) ? answer : null;
  return (
    <PennyChat
      // A new ?answer= starts a new conversation rather than keeping the old one.
      key={initialAnswerId ?? "new"}
      initialAnswerId={initialAnswerId}
      from={typeof from === "string" ? from : null}
      back={pennyBackLink(from)}
    />
  );
}
