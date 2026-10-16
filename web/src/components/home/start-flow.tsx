"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoadingScreen } from "@/components/shell/status-screens";
import { apiRequest } from "@/lib/api-client/client";
import { reportError } from "@/lib/report-error";
import { ROUTES } from "@/lib/routes";

// Where a student lands after signing in (US-02): a saved card match with no
// application goes to results; everyone else goes to Home. If either read
// fails, Home is the safe answer and shows its own error.
async function landingPath(): Promise<string> {
  const [applications, recommendation] = await Promise.all([
    apiRequest("get", "/applications"),
    apiRequest("get", "/recommendations/latest"),
  ]);
  const hasApplication = applications.ok && applications.data.applications.length > 0;
  if (!hasApplication && applications.ok && recommendation.ok) return ROUTES.results;
  return ROUTES.home;
}

export function StartFlow() {
  const router = useRouter();

  useEffect(() => {
    let current = true;
    landingPath()
      .catch((error: unknown) => {
        reportError("StartFlow", error);
        return ROUTES.home;
      })
      .then((path) => {
        if (current) router.replace(path);
      });
    return () => {
      current = false;
    };
  }, [router]);

  return <LoadingScreen label="Getting things ready" />;
}
