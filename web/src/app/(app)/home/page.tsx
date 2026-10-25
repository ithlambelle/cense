import type { Metadata } from "next";

import { HomeView } from "@/components/home/home-view";
import { homeState, profileInitial } from "@/lib/home/state";
import { CELEBRATE_PARAM, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Home | CENSE" };

// Read on the server, so Home never flashes a loading state.
export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const student = await requireStudent(ROUTES.home);
  const { applications, quiz, quizStarted } = await loadStudentSnapshot(student);
  const celebrateId = (await searchParams)[CELEBRATE_PARAM];
  return (
    <HomeView
      state={homeState(applications, quiz, quizStarted)}
      initial={profileInitial(student.email)}
      celebrateId={typeof celebrateId === "string" ? celebrateId : null}
    />
  );
}
