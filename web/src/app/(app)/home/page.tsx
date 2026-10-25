import type { Metadata } from "next";

import { HomeView } from "@/components/home/home-view";
import { homeState, needsDetail, profileInitial } from "@/lib/home/state";
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
  const detail = needsDetail(state) ? await loadApplicationDetail(student, state.primary.id) : null;
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
    />
  );
}
