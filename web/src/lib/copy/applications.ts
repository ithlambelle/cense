import type { ApiData } from "../api-client/client";
import { moneyAmount } from "../money";

type Application = ApiData<"/applications", "get">["applications"][number];

// Plain words for each saved status. "rejected" is shown without the word.
export const STATUS_LABELS: Record<Application["status"], string> = {
  applied: "Applied",
  approved: "Approved",
  rejected: "Not approved",
};

// A second line for a card on Home, or null when there is nothing to add.
// The date is shown in the viewer's own time zone unless one is given.
export function statusDetail(application: Application, timeZone?: string): string | null {
  if (application.status === "approved" && application.creditLimitCents !== null) {
    return `${moneyAmount(application.creditLimitCents)} credit limit`;
  }
  if (application.status === "applied" && application.appliedAt !== null) {
    const date = new Date(application.appliedAt);
    return `On ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}`;
  }
  return null;
}
