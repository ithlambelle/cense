// Created with Claude Code (2026-11-08). What the card setup and autopay
// screens (US-10) read for one approved card, on the server, the same way
// GET /applications/{id}, GET /me/reminder-settings and GET .../plans/first_month
// read it.
import "server-only";

import type { ApplicationDetail } from "@/lib/api/application";
import { findCard } from "@/lib/cards/catalog";
import { issuerForBrand, type Issuer } from "@/lib/cards/issuers";
import { paymentReminderOn } from "@/lib/home/state";
import type { Student } from "@/lib/api/auth";
import { loadApplicationDetail, loadReminderSettings } from "@/lib/student-data";

import { setupProgress, type SetupProgress } from "./progress";

export type CardSetup = {
  application: ApplicationDetail;
  // The card's brand from the catalog ("Discover"), or null for a card added
  // from outside it.
  brand: string | null;
  // Link-out data for the brand, or null when Cense has none.
  issuer: Issuer | null;
  progress: SetupProgress;
};

// Null when the card is not this student's or is not approved: setup is for
// an approved card only.
export async function loadCardSetup(student: Student, applicationId: string): Promise<CardSetup | null> {
  const [application, settings, steps] = await Promise.all([
    loadApplicationDetail(student, applicationId),
    loadReminderSettings(student),
    student.supabase
      .from("plan_steps")
      .select("step")
      .eq("card_application_id", applicationId)
      .eq("student_id", student.studentId)
      .eq("plan", "first_month"),
  ]);
  if (steps.error) throw new Error("Could not read the student's plan.");
  if (!application || application.status !== "approved") return null;
  const done = new Set(((steps.data ?? []) as { step: string }[]).map((row) => row.step));
  const brand = application.cardId ? (findCard(application.cardId)?.brand ?? null) : null;
  return {
    application,
    brand,
    issuer: issuerForBrand(brand),
    progress: setupProgress({
      autopayStatus: application.autopayStatus,
      statementClosingDay: application.statementClosingDay,
      paymentDueDay: application.paymentDueDay,
      spendLimitSet: application.spendLimitCents !== null,
      reminderStep: done.has("payment_reminder"),
      reminderOn: paymentReminderOn(application, settings),
    }),
  };
}
