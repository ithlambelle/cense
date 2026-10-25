import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaymentReminderSetup } from "@/components/reminders/payment-reminder-setup";
import { applicationIdSchema } from "@/lib/api/schemas";
import { paymentRemindersPath, remindersBackLink } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadReminderSetup } from "@/lib/student-data";

export const metadata: Metadata = { title: "Never miss a payment | CENSE" };

// Payment reminders for one card (US-08). Any of the student's cards opens:
// for one that is not approved, saving shows the API's own reason. Opened
// from the card's page (?from=card, with that page's own origin in
// card_from), Back and a finished save return there; otherwise Home, where
// the reminder star is.
export default async function PaymentRemindersPage({ params, searchParams }: PageProps<"/applications/[id]/reminders">) {
  const { id } = await params;
  const { from, card_from: cardFrom } = await searchParams;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(paymentRemindersPath(id));
  const setup = await loadReminderSetup(student, id);
  if (!setup) notFound();
  const back = remindersBackLink(from, cardFrom, setup.application.cardId);
  return (
    <PaymentReminderSetup
      applicationId={id}
      statementClosingDay={setup.application.statementClosingDay}
      paymentDueDay={setup.application.paymentDueDay}
      savedChoices={{ paymentDue: setup.settings.paymentDue, statementClosing: setup.settings.statementClosing }}
      emailsOn={setup.settings.emailsOn}
      firstStatementEmail={setup.firstStatementEmail}
      email={student.email}
      back={back}
      doneHref={back.href}
    />
  );
}
