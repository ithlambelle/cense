import { redirect } from "next/navigation";

import { applicationParam } from "@/lib/denied";
import { planApplication } from "@/lib/home/state";
import { cardSetupPath, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadStudentSnapshot } from "@/lib/student-data";

// The old first-month plan, retired (persona walk, Nov 25: a second card
// opened it and its advice contradicted card setup). Every approved card is
// set up on its own setup list now, so an old link opens that: the card in
// ?application=, or else the most recently approved one. With no approved
// card of the student's, Home.
export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const student = await requireStudent(ROUTES.home);
  const { applications } = await loadStudentSnapshot(student);
  const approved = planApplication(applications, applicationParam((await searchParams).application));
  redirect(approved ? cardSetupPath(approved.id) : ROUTES.home);
}
