import type { Metadata } from "next";

import { HomeView } from "@/components/home/home-view";
import { homeState } from "@/lib/home/state";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Home | CENSE" };

// Read on the server, so Home never flashes a loading state.
export default async function HomePage() {
  const student = await requireStudent(ROUTES.home);
  const { applications, quiz, quizStarted } = await loadStudentSnapshot(student);
  return <HomeView state={homeState(applications, quiz, quizStarted)} />;
}
