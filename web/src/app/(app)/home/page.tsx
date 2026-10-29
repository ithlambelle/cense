import type { Metadata } from "next";

import { HomeView } from "@/components/home/home-view";
import { homeState, needsDetail, profileInitial } from "@/lib/home/state";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { CELEBRATE_PARAM, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplicationDetail, loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Home | CENSE" };

// Read on the server, so Home never flashes a loading state.
export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const student = await requireStudent(ROUTES.home);
  const { applications, quiz, quizStarted } = await loadStudentSnapshot(student);
  const state = homeState(applications, quiz, quizStarted);
  // The leading card's denial reason and autopay, read the same way as
  // GET /applications/{id}. Only those fields reach the page.
  // Safe to spend (US-12) is read alongside, only when Plaid is set up. A
  // failed read leaves its card out rather than failing Home.
  const [detail, safeToSpend] = await Promise.all([
    needsDetail(state) ? loadApplicationDetail(student, state.primary.id) : null,
    plaidConfig() ? loadSafeToSpend(student) : null,
  ]);
  const celebrateId = (await searchParams)[CELEBRATE_PARAM];
  return (
    <HomeView
      state={state}
      initial={profileInitial(student.email)}
      detail={
        detail && {
          denialReason: detail.denialReason,
          denialReasonNote: detail.denialReasonNote,
          autopayStatus: detail.autopayStatus,
          paymentDueDay: detail.paymentDueDay,
        }
      }
      celebrateId={typeof celebrateId === "string" ? celebrateId : null}
      safeToSpend={safeToSpend?.ok ? safeToSpend.value : undefined}
    />
  );
}
