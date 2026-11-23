import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IdentifyStudent } from "@/components/analytics/identify-student";
import { loadAnalyticsOn } from "@/lib/analytics-choice";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { CardDetailView } from "@/components/cards/card-detail-view";
import { findCard } from "@/lib/cards/catalog";
import { cardRewards } from "@/lib/cards/rewards";
import { cardApplication, reminderStatus } from "@/lib/home/state";
import { cardDisplayName } from "@/lib/copy/results";
import { isInternalStudent } from "@/lib/internal-students";
import { currentStudent } from "@/lib/session";
import { estimateYearOne } from "@/lib/results/value";
import type { CardFit } from "@/lib/rules/fit-tier";
import { loadApplicationDetail, loadApplications, loadCardQuiz, loadReminderSettings } from "@/lib/student-data";

export async function generateMetadata({ params }: PageProps<"/cards/[id]">): Promise<Metadata> {
  const { id } = await params;
  const card = findCard(id);
  return { title: card ? `${cardDisplayName(card)} | CENSE` : "Card not found | CENSE" };
}

// Open to everyone. Signed-out visitors are sent to sign-in when they tap an
// issuer button, and come back to this card.
export default async function CardDetailPage({ params, searchParams }: PageProps<"/cards/[id]">) {
  const { id } = await params;
  const { from } = await searchParams;
  const card = findCard(id);
  if (!card) notFound();
  const student = await currentStudent();
  const analyticsOn = student ? await loadAnalyticsOn(student) : null;
  // A signed-in student who tracks this card sees it as their card (K1) and
  // can update it from here (US-05).
  const tracked = student ? cardApplication(await loadApplications(student), card.id) : null;
  // An approved card shows its dates, autopay, spend limit and payment
  // reminders, each changed from here too (Reminders audit R-09): Home leads
  // with one card, and the others open this page.
  const [detail, settings] =
    student && tracked?.status === "approved"
      ? await Promise.all([loadApplicationDetail(student, tracked.id), loadReminderSettings(student)])
      : [null, null];
  const reminders = detail && settings ? reminderStatus(detail, settings) : null;
  const rewards = cardRewards(card.id);
  // How the card fits the student's quiz answers (K2's fit row and Why it
  // fits you) and their year-one estimate, from their saved answers. The page
  // still works without them.
  let estimate = null;
  let fit: CardFit | null = null;
  if (student) {
    try {
      const quiz = await loadCardQuiz(student, card);
      fit = quiz.fit;
      estimate = estimateYearOne(rewards, quiz.profile);
    } catch {
      console.warn(JSON.stringify({ event: "card_quiz_read_failed" }));
    }
  }
  return (
    <>
      {/* Outside the (app) layout, so a signed-in student is identified here too. */}
      {student ? (
        <IdentifyStudent
          studentId={student.studentId}
          isInternal={isInternalStudent(student.studentId)}
          analyticsOn={analyticsOn}
        />
      ) : null}
      <TrackOnMount event="card_details_viewed" props={{ card_id: card.id, signed_in: student !== null }} />
      <CardDetailView
        card={card}
        signedIn={student !== null}
        from={from}
        tracked={tracked}
        detail={detail}
        reminders={reminders}
        rewards={rewards}
        estimate={estimate}
        fit={fit}
      />
    </>
  );
}
